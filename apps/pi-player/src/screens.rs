//! Full-screen setup and status screens, drawn by mpv's OSD as ASS events.
//!
//! mpv renders these with libass on top of its idle window, so the claim code,
//! Wi-Fi setup and "waiting" screens need no browser or toolkit.

use crate::agent::{PlayerState, WifiStatus};
use crate::wifi_form::{Field, WifiForm};

pub const WIDTH: u32 = 1920;
pub const HEIGHT: u32 = 1080;

// ASS colours are &HBBGGRR& (blue first). These match the web player.
const BACKGROUND: &str = "&H130D09&"; // #090d13
const TEXT: &str = "&HFBF7F5&"; // #f5f7fb
const MUTED: &str = "&HCDC2B8&"; // #b8c2cd
const ACCENT: &str = "&HFFAA91&"; // #91aaff
const ERROR: &str = "&HD6D0FF&"; // #ffd0d6
const FIELD: &str = "&H24190F&"; // #0f1924
const FIELD_BORDER: &str = "&H5A4A3C&"; // #3c4a5a

#[derive(Debug, Clone, PartialEq)]
pub enum Screen {
    Starting,
    WifiSetup,
    Claim {
        code: Option<String>,
    },
    Waiting {
        downloading: bool,
        error: Option<String>,
    },
    Playing,
}

/// Mirrors the web player's screen choice so both renderers behave the same.
pub fn choose(state: Option<&PlayerState>) -> Screen {
    let Some(state) = state else {
        return Screen::Starting;
    };
    let claim_code = state
        .claim_code
        .clone()
        .filter(|code| !code.trim().is_empty());
    if !state.has_manifest {
        let offline = state.wifi.as_ref().is_some_and(|wifi| !wifi.connected);
        if !state.claimed && claim_code.is_none() && offline {
            return Screen::WifiSetup;
        }
        if !state.claimed {
            return Screen::Claim { code: claim_code };
        }
        return Screen::Waiting {
            downloading: false,
            error: state.last_error.clone(),
        };
    }
    if state.items.is_empty() {
        return Screen::Waiting {
            downloading: state.pending_items > 0,
            error: state.last_error.clone(),
        };
    }
    Screen::Playing
}

/// Makes arbitrary text safe to embed in an ASS event: braces would open an
/// override block and backslashes start escapes like \N.
pub fn escape(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '\\' => escaped.push_str("\\\u{FEFF}"),
            '{' => escaped.push_str("\\{"),
            '}' => escaped.push_str("\\}"),
            '\n' | '\r' | '\t' => escaped.push(' '),
            ch if ch.is_control() => {}
            ch => escaped.push(ch),
        }
    }
    escaped
}

fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut short: String = text.chars().take(max.saturating_sub(1)).collect();
    short.push('…');
    short
}

fn rect(x: u32, y: u32, w: u32, h: u32, color: &str, alpha: &str) -> String {
    format!(
        "{{\\an7\\pos(0,0)\\bord0\\shad0\\1c{color}\\1a{alpha}\\p1}}m {x} {y} l {x2} {y} {x2} {y2} {x} {y2}{{\\p0}}",
        x2 = x + w,
        y2 = y + h
    )
}

fn text(x: u32, y: u32, size: u32, color: &str, extra: &str, body: &str) -> String {
    format!(
        "{{\\an5\\pos({x},{y})\\fs{size}\\bord0\\shad0\\1c{color}{extra}}}{}",
        escape(body)
    )
}

fn background() -> String {
    rect(0, 0, WIDTH, HEIGHT, BACKGROUND, "&H00&")
}

/// Returns the ASS events for `screen`, or None when nothing should be drawn.
pub fn render(
    screen: &Screen,
    form: &WifiForm,
    wifi: Option<&WifiStatus>,
    last_error: Option<&str>,
) -> Option<String> {
    let lines = match screen {
        Screen::Playing => return None,
        Screen::Starting => vec![
            background(),
            text(960, 470, 30, ACCENT, "\\b1\\fsp4", "SCREEN READY"),
            text(960, 550, 72, TEXT, "\\b1", "Starting player"),
        ],
        Screen::Claim { code } => vec![
            background(),
            text(960, 330, 30, ACCENT, "\\b1\\fsp4", "CLAIM THIS SCREEN"),
            text(
                960,
                500,
                200,
                TEXT,
                "\\b1\\fsp24",
                code.as_deref().unwrap_or("••••••"),
            ),
            text(
                960,
                680,
                38,
                MUTED,
                "",
                "Open Digital Curator, enter this code, and the screen will connect automatically.",
            ),
        ],
        Screen::Waiting { downloading, error } => {
            let mut lines = vec![
                background(),
                text(960, 420, 30, ACCENT, "\\b1\\fsp4", "SCREEN READY"),
                text(
                    960,
                    510,
                    80,
                    TEXT,
                    "\\b1",
                    if *downloading {
                        "Downloading content"
                    } else {
                        "Waiting for content"
                    },
                ),
                text(
                    960,
                    610,
                    38,
                    MUTED,
                    "",
                    if *downloading {
                        "Your playlist will start as soon as the first item is saved on this screen."
                    } else {
                        "Assign a playlist in Digital Curator. This screen will update automatically."
                    },
                ),
            ];
            if let Some(error) = error.as_deref().filter(|e| !e.is_empty()) {
                lines.push(text(960, 720, 28, ERROR, "", &truncate(error, 120)));
            }
            lines
        }
        Screen::WifiSetup => wifi_lines(form, wifi, last_error),
    };
    Some(lines.join("\n"))
}

fn wifi_lines(form: &WifiForm, wifi: Option<&WifiStatus>, last_error: Option<&str>) -> Vec<String> {
    let mut lines = vec![
        background(),
        text(960, 210, 30, ACCENT, "\\b1\\fsp4", "FIRST-TIME SETUP"),
        text(960, 290, 80, TEXT, "\\b1", "Connect to Wi-Fi"),
        text(
            960,
            375,
            36,
            MUTED,
            "",
            "Connect this screen to the network to receive its claim code.",
        ),
    ];

    let fields = [
        (Field::Ssid, "Wi-Fi name", form.ssid.clone(), 460),
        (
            Field::Password,
            "Password",
            "•".repeat(form.password.chars().count()),
            620,
        ),
    ];
    for (field, label, value, y) in fields {
        let focused = form.focus == field && !form.saving;
        lines.push(format!(
            "{{\\an4\\pos(560,{y})\\fs30\\bord0\\shad0\\1c{MUTED}}}{}",
            escape(label)
        ));
        let border = if focused { ACCENT } else { FIELD_BORDER };
        lines.push(rect(556, y + 26, 808, 88, border, "&H00&"));
        lines.push(rect(560, y + 30, 800, 80, FIELD, "&H00&"));
        let cursor = if focused { "▏" } else { "" };
        let shown = truncate(&value, 40);
        lines.push(format!(
            "{{\\an4\\pos(590,{})\\fs40\\bord0\\shad0\\1c{TEXT}}}{}{cursor}",
            y + 70,
            escape(&shown)
        ));
    }

    let button = if form.saving {
        "Connecting…"
    } else {
        "Press Enter to connect"
    };
    lines.push(rect(
        560,
        780,
        800,
        84,
        if form.saving { FIELD_BORDER } else { ACCENT },
        "&H00&",
    ));
    lines.push(text(960, 822, 36, BACKGROUND, "\\b1", button));
    lines.push(text(
        960,
        910,
        28,
        MUTED,
        "",
        "Use a USB keyboard. Tab switches fields.",
    ));

    let mut status = Vec::new();
    status.push((
        if wifi.is_some_and(|w| w.supported) {
            "Wireless hardware ready"
        } else {
            "Wireless setup unavailable"
        }
        .to_string(),
        MUTED,
    ));
    if let Some(message) = form.message.as_deref() {
        status.push((
            message.to_string(),
            if form.message_is_error { ERROR } else { TEXT },
        ));
    } else if let Some(error) = wifi.and_then(|w| w.error.as_deref()).or(last_error) {
        status.push((error.to_string(), ERROR));
    }
    for (index, (message, color)) in status.iter().enumerate() {
        lines.push(text(
            960,
            970 + index as u32 * 40,
            26,
            color,
            "",
            &truncate(message, 110),
        ));
    }
    lines
}

/// The small "Recovering playback…" badge shown over media.
pub fn recovering_badge() -> String {
    [
        rect(24, 1000, 330, 56, BACKGROUND, "&H38&"),
        format!("{{\\an4\\pos(46,1028)\\fs26\\bord0\\shad0\\1c{ERROR}}}Recovering playback…"),
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::Item;

    fn state() -> PlayerState {
        PlayerState::default()
    }

    #[test]
    fn escapes_ass_control_sequences() {
        assert_eq!(escape("a{\\b1}b\nc"), "a\\{\\\u{FEFF}b1\\}b c");
    }

    #[test]
    fn chooses_wifi_setup_only_when_offline_and_unclaimed() {
        let mut current = state();
        current.wifi = Some(WifiStatus {
            supported: true,
            connected: false,
            ..Default::default()
        });
        assert_eq!(choose(Some(&current)), Screen::WifiSetup);

        current.claim_code = Some("ABC123".into());
        assert_eq!(
            choose(Some(&current)),
            Screen::Claim {
                code: Some("ABC123".into())
            }
        );

        current.claim_code = None;
        current.wifi = Some(WifiStatus {
            supported: true,
            connected: true,
            ..Default::default()
        });
        assert_eq!(choose(Some(&current)), Screen::Claim { code: None });
    }

    #[test]
    fn chooses_waiting_and_playing() {
        assert_eq!(choose(None), Screen::Starting);
        let mut current = state();
        current.claimed = true;
        current.has_manifest = true;
        current.pending_items = 2;
        assert_eq!(
            choose(Some(&current)),
            Screen::Waiting {
                downloading: true,
                error: None
            }
        );
        current.items.push(Item {
            id: "i".into(),
            asset_id: "a".into(),
            asset_type: "image".into(),
            title: String::new(),
            local_path: "/c/a.jpg".into(),
            duration_seconds: None,
        });
        assert_eq!(choose(Some(&current)), Screen::Playing);
        assert!(render(&Screen::Playing, &WifiForm::default(), None, None).is_none());
    }

    #[test]
    fn claim_screen_shows_code() {
        let events = render(
            &Screen::Claim {
                code: Some("XY12".into()),
            },
            &WifiForm::default(),
            None,
            None,
        )
        .unwrap();
        assert!(events.contains("XY12"));
        assert!(events.contains("CLAIM THIS SCREEN"));
    }

    #[test]
    fn wifi_screen_masks_password() {
        let form = WifiForm {
            ssid: "Showroom".into(),
            password: "secret".into(),
            ..Default::default()
        };
        let events = render(&Screen::WifiSetup, &form, None, None).unwrap();
        assert!(events.contains("Showroom"));
        assert!(!events.contains("secret"));
        assert!(events.contains("••••••"));
    }
}
