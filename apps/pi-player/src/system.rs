//! Small OS helpers: HDMI audio detection, signals, and the kiosk VT.

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

pub static QUIT: AtomicBool = AtomicBool::new(false);
pub static SCREENSHOT: AtomicBool = AtomicBool::new(false);

extern "C" fn on_quit(_: libc::c_int) {
    QUIT.store(true, Ordering::SeqCst);
}

extern "C" fn on_screenshot(_: libc::c_int) {
    SCREENSHOT.store(true, Ordering::SeqCst);
}

pub fn install_signal_handlers() {
    unsafe {
        libc::signal(libc::SIGTERM, on_quit as *const () as libc::sighandler_t);
        libc::signal(libc::SIGINT, on_quit as *const () as libc::sighandler_t);
        libc::signal(libc::SIGHUP, on_quit as *const () as libc::sighandler_t);
        libc::signal(
            libc::SIGUSR1,
            on_screenshot as *const () as libc::sighandler_t,
        );
    }
}

/// Finds the ALSA HDMI device of a connected monitor, like the legacy kiosk:
/// the first card whose ELD names a monitor.
pub fn detect_hdmi_audio_device(asound: &Path) -> Option<String> {
    let mut cards: Vec<_> = fs::read_dir(asound)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name.starts_with("card") && name[4..].chars().all(|c| c.is_ascii_digit())
                })
        })
        .collect();
    cards.sort();

    for card in cards {
        let Ok(entries) = fs::read_dir(&card) else {
            continue;
        };
        let mut elds: Vec<_> = entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("eld"))
            })
            .collect();
        elds.sort();
        let has_monitor = elds.iter().any(|eld| {
            fs::read_to_string(eld).is_ok_and(|content| {
                content.lines().any(|line| {
                    let mut parts = line.split_whitespace();
                    parts.next() == Some("monitor_name") && parts.next().is_some()
                })
            })
        });
        if !has_monitor {
            continue;
        }
        let id = fs::read_to_string(card.join("id")).ok()?.trim().to_string();
        if !id.is_empty() {
            return Some(format!("alsa/hdmi:CARD={id},DEV=0"));
        }
    }
    None
}

/// Sends a message to systemd's notify socket, if the service has one.
/// The kiosk unit runs the player under a launcher script, so the unit uses
/// NotifyAccess=all and the player arms its own watchdog with WATCHDOG_USEC.
pub fn sd_notify(message: &str) {
    use std::os::unix::net::{SocketAddr, UnixDatagram};
    let Ok(path) = std::env::var("NOTIFY_SOCKET") else {
        return;
    };
    let Ok(socket) = UnixDatagram::unbound() else {
        return;
    };
    let address = if let Some(name) = path.strip_prefix('@') {
        use std::os::linux::net::SocketAddrExt;
        SocketAddr::from_abstract_name(name.as_bytes())
    } else {
        SocketAddr::from_pathname(&path)
    };
    if let Ok(address) = address {
        let _ = socket.send_to_addr(message.as_bytes(), &address);
    }
}

const VT_ACTIVATE: libc::c_ulong = 0x5606;
const VT_WAITACTIVE: libc::c_ulong = 0x5607;

/// Brings the kiosk's own VT to the front so the DRM output is not fighting
/// the text console. Best effort: systemd's ExecStartPost also runs chvt.
pub fn activate_own_vt() {
    unsafe {
        let name = libc::ttyname(libc::STDIN_FILENO);
        if name.is_null() {
            return;
        }
        let name = std::ffi::CStr::from_ptr(name).to_string_lossy();
        let Some(number) = name
            .strip_prefix("/dev/tty")
            .and_then(|n| n.parse::<libc::c_int>().ok())
        else {
            return;
        };
        if libc::ioctl(libc::STDIN_FILENO, VT_ACTIVATE as _, number) == 0 {
            libc::ioctl(libc::STDIN_FILENO, VT_WAITACTIVE as _, number);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_card_with_connected_monitor() {
        let root = std::env::temp_dir().join(format!("showroom-asound-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for (card, id, monitor) in [("card0", "vc4hdmi0", ""), ("card1", "vc4hdmi1", "LG TV")] {
            let dir = root.join(card);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("id"), format!("{id}\n")).unwrap();
            fs::write(
                dir.join("eld#0.0"),
                format!("monitor_present\t1\nmonitor_name\t{monitor}\n"),
            )
            .unwrap();
        }
        assert_eq!(
            detect_hdmi_audio_device(&root).as_deref(),
            Some("alsa/hdmi:CARD=vc4hdmi1,DEV=0")
        );
        fs::remove_dir_all(&root).unwrap();
    }
}
