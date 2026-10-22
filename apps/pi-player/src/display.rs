//! HDMI connection state from sysfs, so the player can wait for a TV that is
//! off at boot and reopen the display after the cable or TV comes back.

use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Connection {
    /// At least one display connector reports a monitor.
    Connected,
    /// Display connectors exist and none reports a monitor.
    Disconnected,
    /// No connector status is readable (not a KMS device, or sysfs missing);
    /// the player then just tries to open the display.
    Unknown,
}

/// Reads `/sys/class/drm/card*-*/status` (e.g. `card1-HDMI-A-1/status`).
pub fn connection(drm_class: &Path) -> Connection {
    let Ok(entries) = fs::read_dir(drm_class) else {
        return Connection::Unknown;
    };
    let mut seen = false;
    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        // Connector directories look like card1-HDMI-A-1; skip card1 itself
        // and writeback connectors, which never have a monitor.
        if !name.starts_with("card") || !name.contains('-') || name.contains("Writeback") {
            continue;
        }
        let Ok(status) = fs::read_to_string(entry.path().join("status")) else {
            continue;
        };
        seen = true;
        if status.trim() == "connected" {
            return Connection::Connected;
        }
    }
    if seen {
        Connection::Disconnected
    } else {
        Connection::Unknown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str, connectors: &[(&str, &str)]) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("showroom-drm-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("card1")).unwrap();
        for (connector, status) in connectors {
            let dir = root.join(connector);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("status"), format!("{status}\n")).unwrap();
        }
        root
    }

    #[test]
    fn reports_connected_when_any_hdmi_has_a_monitor() {
        let root = fixture(
            "connected",
            &[
                ("card1-HDMI-A-1", "disconnected"),
                ("card1-HDMI-A-2", "connected"),
                ("card1-Writeback-1", "unknown"),
            ],
        );
        assert_eq!(connection(&root), Connection::Connected);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn reports_disconnected_and_unknown() {
        let root = fixture("off", &[("card1-HDMI-A-1", "disconnected")]);
        assert_eq!(connection(&root), Connection::Disconnected);
        fs::remove_dir_all(&root).unwrap();
        assert_eq!(
            connection(Path::new("/nonexistent/drm")),
            Connection::Unknown
        );
    }
}
