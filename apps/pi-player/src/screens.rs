//! Full-screen setup and status screens, drawn by mpv's OSD as ASS events.
//!
//! mpv renders these with libass on top of its idle window, so the claim code,
//! Wi-Fi setup and "waiting" screens need no browser or toolkit.

use crate::agent::{Hotspot, Network, PlayerState, WifiStatus};
use crate::wifi_form::{Field, Mode, WifiForm};

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
        /// Scan-to-pair QR modules, empty when the agent sends none.
        qr: Vec<String>,
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
            let qr = if claim_code.is_some() {
                state.claim_qr.clone()
            } else {
                Vec::new()
            };
            return Screen::Claim {
                code: claim_code,
                qr,
            };
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

/// Splits a six-character pairing code into two groups so it reads across a room.
pub fn format_claim_code(code: &str) -> String {
    let clean: String = code.split_whitespace().collect::<String>().to_uppercase();
    if clean.chars().count() != 6 {
        return escape(&clean);
    }
    let (first, second) = clean.split_at(clean.char_indices().nth(3).map(|(i, _)| i).unwrap_or(3));
    escape(&format!("{first} {second}"))
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
        Screen::Claim { code, qr } => claim_lines(code.as_deref(), qr, wifi),
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
    let networks = wifi.map(|w| w.networks.as_slice()).unwrap_or_default();
    let hotspot = wifi
        .and_then(|w| w.hotspot.as_ref())
        .filter(|h| !h.join_qr.is_empty());
    let mut lines = vec![
        background(),
        text(960, 110, 30, ACCENT, "\\b1\\fsp4", "FIRST-TIME SETUP"),
        text(960, 185, 72, TEXT, "\\b1", "Connect to Wi-Fi"),
    ];

    // With a hotspot, the phone path is on the left and the keyboard path on
    // the right; without one, the keyboard path is centered.
    let panel_x = if let Some(hotspot) = hotspot {
        phone_lines(&mut lines, hotspot);
        lines.push(rect(959, 300, 2, 640, FIELD_BORDER, "&H00&"));
        1040
    } else {
        lines.push(text(
            960,
            255,
            36,
            MUTED,
            "",
            "Choose this screen's network to get a pairing code.",
        ));
        560
    };
    if hotspot.is_some() {
        lines.push(label(panel_x, 320, "OR USE A KEYBOARD"));
    }
    let top = if hotspot.is_some() { 370 } else { 330 };

    match form.view(networks) {
        Mode::List => list_lines(&mut lines, form, networks, panel_x, top),
        Mode::Password => password_lines(&mut lines, form, panel_x, top),
        Mode::Manual => manual_lines(&mut lines, form, panel_x, top, !networks.is_empty()),
    }

    // One status line: what the keyboard just did, else what a phone did,
    // else any agent error.
    let attempt_error = wifi
        .and_then(|w| w.last_attempt.as_ref())
        .filter(|a| !a.ok)
        .and_then(|a| a.message.clone());
    let status = if let Some(message) = form.message.as_deref() {
        Some((
            message.to_string(),
            if form.message_is_error { ERROR } else { TEXT },
        ))
    } else if wifi.is_some_and(|w| w.connecting) {
        Some(("Connecting…".to_string(), TEXT))
    } else if let Some(message) = attempt_error {
        Some((message, ERROR))
    } else if wifi.is_some_and(|w| !w.supported) {
        Some((
            "Wireless setup unavailable. Connect Ethernet instead.".to_string(),
            ERROR,
        ))
    } else {
        wifi.and_then(|w| w.error.clone())
            .or(last_error.map(str::to_string))
            .map(|error| (error, ERROR))
    };
    if let Some((message, color)) = status {
        lines.push(text(960, 1010, 30, color, "", &truncate(&message, 110)));
    }
    lines
}

fn claim_lines(code: Option<&str>, qr: &[String], wifi: Option<&WifiStatus>) -> Vec<String> {
    let code = code
        .map(format_claim_code)
        .unwrap_or_else(|| "••• •••".to_string());
    let status = match wifi {
        Some(wifi) if wifi.connected => match wifi.ssid.as_deref().filter(|s| !s.is_empty()) {
            Some(ssid) => format!("Online via {}", truncate(ssid, 40)),
            None => "Online".to_string(),
        },
        Some(_) => "Waiting for network".to_string(),
        None => "Online".to_string(),
    };
    if qr.is_empty() {
        return vec![
            background(),
            text(960, 250, 30, ACCENT, "\\b1\\fsp4", "PAIR THIS SCREEN"),
            text(960, 410, 200, TEXT, "\\b1\\fsp24", &code),
            text(
                960,
                590,
                38,
                MUTED,
                "",
                "1   Open Digital Curator on a phone or computer",
            ),
            text(
                960,
                650,
                38,
                MUTED,
                "",
                "2   Go to Screens and choose Add screen",
            ),
            text(
                960,
                710,
                38,
                MUTED,
                "",
                "3   Enter this code. The screen connects on its own",
            ),
            text(960, 820, 28, MUTED, "", &status),
        ];
    }
    // The phone that just set up Wi-Fi is in hand: scanning beats typing.
    let mut lines = vec![
        background(),
        text(660, 250, 30, ACCENT, "\\b1\\fsp4", "PAIR THIS SCREEN"),
        text(660, 410, 170, TEXT, "\\b1\\fsp20", &code),
        text(
            660,
            590,
            36,
            MUTED,
            "",
            "1   Scan the square with your phone camera",
        ),
        text(
            660,
            650,
            36,
            MUTED,
            "",
            "2   Sign in to Digital Curator and choose Add screen",
        ),
        text(
            660,
            710,
            36,
            MUTED,
            "",
            "3   The screen connects on its own",
        ),
        text(
            660,
            800,
            28,
            MUTED,
            "",
            "No phone? Open Screens in Digital Curator, choose Add screen and enter the code.",
        ),
        text(660, 880, 28, MUTED, "", &status),
    ];
    let size = qr_lines(&mut lines, qr, 1240, 280, 440);
    lines.push(text(
        1240 + size / 2,
        280 + size + 50,
        30,
        TEXT,
        "\\b1",
        "Scan to add this screen",
    ));
    lines
}

fn label(x: u32, y: u32, body: &str) -> String {
    format!(
        "{{\\an4\\pos({x},{y})\\fs28\\b1\\fsp3\\bord0\\shad0\\1c{ACCENT}}}{}",
        escape(body)
    )
}

fn left_text(x: u32, y: u32, size: u32, color: &str, body: &str) -> String {
    format!(
        "{{\\an4\\pos({x},{y})\\fs{size}\\bord0\\shad0\\1c{color}}}{}",
        escape(body)
    )
}

fn phone_lines(lines: &mut Vec<String>, hotspot: &Hotspot) {
    let x = 120;
    lines.push(label(x, 320, "USE YOUR PHONE"));
    let size = qr_lines(lines, &hotspot.join_qr, x, 370, 380);
    let steps_x = x + size + 48;
    let ssid = truncate(&hotspot.ssid, 22);
    let steps = [
        ("1", "Scan with your camera"),
        ("2", "Tap to join the Wi-Fi"),
        ("3", "Pick your Wi-Fi on the page"),
    ];
    for (index, (number, step)) in steps.iter().enumerate() {
        let y = 400 + index as u32 * 110;
        lines.push(left_text(steps_x, y, 44, ACCENT, number));
        lines.push(left_text(steps_x + 44, y, 32, TEXT, step));
    }
    lines.push(left_text(
        x,
        800,
        28,
        MUTED,
        "No camera? Join this Wi-Fi by hand:",
    ));
    lines.push(left_text(
        x,
        850,
        34,
        TEXT,
        &format!("{ssid}   ·   password {}", hotspot.password),
    ));
    let url = hotspot
        .url
        .trim_end_matches('/')
        .trim_start_matches("http://");
    if !url.is_empty() {
        lines.push(left_text(
            x,
            900,
            28,
            MUTED,
            &format!("then open {url} if the page doesn't appear."),
        ));
    }
}

/// Draws QR modules (rows of '0'/'1') as a white square with black runs,
/// returning the drawn width.
fn qr_lines(lines: &mut Vec<String>, rows: &[String], x: u32, y: u32, max: u32) -> u32 {
    const QUIET: u32 = 3;
    let count = rows.len() as u32;
    let module = (max / (count + QUIET * 2)).max(1);
    let size = module * (count + QUIET * 2);
    lines.push(rect(x, y, size, size, "&HFFFFFF&", "&H00&"));
    let mut path = String::new();
    for (row_index, row) in rows.iter().enumerate() {
        let top = y + (QUIET + row_index as u32) * module;
        let bytes = row.as_bytes();
        let mut column = 0;
        while column < bytes.len() {
            if bytes[column] != b'1' {
                column += 1;
                continue;
            }
            let start = column;
            while column < bytes.len() && bytes[column] == b'1' {
                column += 1;
            }
            let left = x + (QUIET + start as u32) * module;
            let right = x + (QUIET + column as u32) * module;
            let bottom = top + module;
            path.push_str(&format!(
                "m {left} {top} l {right} {top} {right} {bottom} {left} {bottom} "
            ));
        }
    }
    lines.push(format!(
        "{{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H000000&\\1a&H00&\\p1}}{}{{\\p0}}",
        path.trim_end()
    ));
    size
}

const ROW_HEIGHT: u32 = 76;
const VISIBLE_ROWS: usize = 6;

fn list_lines(lines: &mut Vec<String>, form: &WifiForm, networks: &[Network], x: u32, top: u32) {
    let width = 800;
    let selected = form.selected(networks);
    let total = networks.len() + 1;
    let first = selected
        .saturating_sub(VISIBLE_ROWS - 1)
        .min(total.saturating_sub(VISIBLE_ROWS));
    for (slot, index) in (first..total).take(VISIBLE_ROWS).enumerate() {
        let y = top + slot as u32 * (ROW_HEIGHT + 10);
        let focused = index == selected && !form.saving;
        if focused {
            lines.push(rect(
                x - 4,
                y - 4,
                width + 8,
                ROW_HEIGHT + 8,
                ACCENT,
                "&H00&",
            ));
        }
        lines.push(rect(x, y, width, ROW_HEIGHT, FIELD, "&H00&"));
        let middle = y + ROW_HEIGHT / 2;
        match networks.get(index) {
            Some(network) => {
                lines.push(left_text(
                    x + 28,
                    middle,
                    38,
                    TEXT,
                    &truncate(&network.ssid, 26),
                ));
                let detail = if network.in_use {
                    "Saved"
                } else if network.secure {
                    "Password"
                } else {
                    "Open"
                };
                lines.push(format!(
                    "{{\\an6\\pos({},{middle})\\fs28\\bord0\\shad0\\1c{MUTED}}}{detail}",
                    x + width - 110
                ));
                signal_bars(lines, x + width - 88, middle, network.signal);
            }
            None => lines.push(left_text(x + 28, middle, 38, MUTED, "Other network…")),
        }
    }
    if total > VISIBLE_ROWS {
        let shown = format!(
            "{} of {} networks",
            (first + VISIBLE_ROWS).min(total - 1),
            total - 1
        );
        lines.push(left_text(
            x,
            top + VISIBLE_ROWS as u32 * (ROW_HEIGHT + 10) + 10,
            26,
            MUTED,
            &shown,
        ));
    }
    lines.push(left_text(
        x,
        top + VISIBLE_ROWS as u32 * (ROW_HEIGHT + 10) + 60,
        28,
        MUTED,
        "USB keyboard:   ↑ ↓ to choose   ·   Enter to connect",
    ));
}

fn signal_bars(lines: &mut Vec<String>, x: u32, middle: u32, signal: u8) {
    let level = match signal {
        75.. => 4,
        50..=74 => 3,
        25..=49 => 2,
        _ => 1,
    };
    for bar in 0..4u32 {
        let height = 10 + bar * 7;
        let color = if bar < level { ACCENT } else { FIELD_BORDER };
        lines.push(rect(
            x + bar * 14,
            middle + 16 - height,
            9,
            height,
            color,
            "&H00&",
        ));
    }
}

fn field_lines(lines: &mut Vec<String>, x: u32, y: u32, title: &str, value: &str, focused: bool) {
    lines.push(left_text(x, y, 30, MUTED, title));
    let border = if focused { ACCENT } else { FIELD_BORDER };
    lines.push(rect(x - 4, y + 26, 808, 88, border, "&H00&"));
    lines.push(rect(x, y + 30, 800, 80, FIELD, "&H00&"));
    let cursor = if focused { "▏" } else { "" };
    lines.push(format!(
        "{{\\an4\\pos({},{})\\fs40\\bord0\\shad0\\1c{TEXT}}}{}{cursor}",
        x + 30,
        y + 70,
        escape(&truncate(value, 40))
    ));
}

fn button_lines(lines: &mut Vec<String>, x: u32, y: u32, saving: bool, caption: &str) {
    lines.push(rect(
        x,
        y,
        800,
        84,
        if saving { FIELD_BORDER } else { ACCENT },
        "&H00&",
    ));
    lines.push(text(
        x + 400,
        y + 42,
        36,
        BACKGROUND,
        "\\b1",
        if saving { "Connecting…" } else { caption },
    ));
}

fn masked(form: &WifiForm) -> String {
    if form.show_password {
        form.password.clone()
    } else {
        "•".repeat(form.password.chars().count())
    }
}

fn password_lines(lines: &mut Vec<String>, form: &WifiForm, x: u32, top: u32) {
    lines.push(left_text(x, top + 10, 30, MUTED, "Network"));
    lines.push(left_text(x, top + 60, 48, TEXT, &truncate(&form.ssid, 30)));
    field_lines(lines, x, top + 130, "Password", &masked(form), !form.saving);
    button_lines(lines, x, top + 290, form.saving, "Press Enter to connect");
    lines.push(left_text(
        x,
        top + 420,
        28,
        MUTED,
        "Tab shows the password   ·   Esc goes back to the list",
    ));
}

fn manual_lines(lines: &mut Vec<String>, form: &WifiForm, x: u32, top: u32, has_list: bool) {
    let fields = [
        (Field::Ssid, "Wi-Fi name", form.ssid.clone(), top),
        (
            Field::Password,
            "Password (leave empty for an open network)",
            masked(form),
            top + 160,
        ),
    ];
    for (field, title, value, y) in fields {
        field_lines(
            lines,
            x,
            y,
            title,
            &value,
            form.focus == field && !form.saving,
        );
    }
    button_lines(lines, x, top + 330, form.saving, "Press Enter to connect");
    lines.push(left_text(
        x,
        top + 460,
        28,
        MUTED,
        if has_list {
            "Tab switches fields   ·   Esc goes back to the list"
        } else {
            "Use a USB keyboard. Tab switches fields."
        },
    ));
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
        current.claim_qr = vec!["101".into()];
        assert_eq!(
            choose(Some(&current)),
            Screen::Claim {
                code: Some("ABC123".into()),
                qr: vec!["101".into()],
            }
        );

        current.claim_code = None;
        current.wifi = Some(WifiStatus {
            supported: true,
            connected: true,
            ..Default::default()
        });
        assert_eq!(
            choose(Some(&current)),
            Screen::Claim {
                code: None,
                qr: Vec::new(),
            }
        );
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
                qr: Vec::new(),
            },
            &WifiForm::default(),
            None,
            None,
        )
        .unwrap();
        assert!(events.contains("XY12"));
        assert!(events.contains("PAIR THIS SCREEN"));
        assert!(events.contains("Go to Screens and choose Add screen"));
        assert!(!events.contains("Scan to add"));

        let events = render(
            &Screen::Claim {
                code: Some("XY12".into()),
                qr: vec!["101".into(), "010".into(), "101".into()],
            },
            &WifiForm::default(),
            None,
            None,
        )
        .unwrap();
        assert!(events.contains("XY12"));
        assert!(events.contains("Scan to add this screen"));
        assert!(events.contains("Scan the square with your phone camera"));
        assert_eq!(format_claim_code("k7p4qx"), "K7P 4QX");
    }

    #[test]
    fn wifi_screen_lists_networks_and_shows_the_phone_path() {
        let wifi = WifiStatus {
            supported: true,
            networks: vec![Network {
                ssid: "Guest {x}".into(),
                signal: 70,
                secure: true,
                in_use: false,
            }],
            hotspot: Some(Hotspot {
                ssid: "Showroom-AB12".into(),
                password: "kp7wm3xq".into(),
                url: "http://10.42.0.1/".into(),
                join_qr: vec!["101".into(), "010".into(), "111".into()],
            }),
            ..Default::default()
        };
        let events = render(&Screen::WifiSetup, &WifiForm::default(), Some(&wifi), None).unwrap();
        assert!(events.contains("Guest \\{x\\}"));
        assert!(events.contains("Other network…"));
        assert!(events.contains("USE YOUR PHONE"));
        assert!(events.contains("kp7wm3xq"));
        assert!(events.contains("10.42.0.1"));

        let without_hotspot = WifiStatus {
            hotspot: None,
            ..wifi
        };
        let events = render(
            &Screen::WifiSetup,
            &WifiForm::default(),
            Some(&without_hotspot),
            None,
        )
        .unwrap();
        assert!(!events.contains("USE YOUR PHONE"));
    }

    #[test]
    fn wifi_screen_shows_a_failed_phone_attempt() {
        let wifi = WifiStatus {
            supported: true,
            last_attempt: Some(crate::agent::Attempt {
                ssid: "Guest".into(),
                ok: false,
                message: Some("Couldn't join Guest. Check the password and try again.".into()),
            }),
            ..Default::default()
        };
        let events = render(&Screen::WifiSetup, &WifiForm::default(), Some(&wifi), None).unwrap();
        assert!(events.contains("Check the password"));
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
