//! Talks to the showroom-agent's local HTTP server on 127.0.0.1.
//!
//! The agent only listens on loopback, so a tiny HTTP/1.0 client is enough and
//! keeps the player free of TLS and async dependencies.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiStatus {
    #[serde(default)]
    pub supported: bool,
    #[serde(default)]
    pub connected: bool,
    #[serde(default)]
    pub ssid: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    /// Scan results, strongest first. Agents before the setup picker send
    /// none, and the screen falls back to typing the name.
    #[serde(default)]
    pub networks: Vec<Network>,
    /// The setup hotspot a phone can join, when the image enables it.
    #[serde(default)]
    pub hotspot: Option<Hotspot>,
    #[serde(default)]
    pub connecting: bool,
    #[serde(default)]
    pub last_attempt: Option<Attempt>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Network {
    pub ssid: String,
    #[serde(default)]
    pub signal: u8,
    #[serde(default)]
    pub secure: bool,
    #[serde(default)]
    pub in_use: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hotspot {
    pub ssid: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub url: String,
    /// QR modules, one string of '0'/'1' per row.
    #[serde(default)]
    pub join_qr: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    pub ssid: String,
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    #[serde(default)]
    pub id: String,
    pub asset_id: String,
    pub asset_type: String,
    #[serde(default)]
    pub title: String,
    pub local_path: String,
    #[serde(default)]
    pub duration_seconds: Option<u32>,
}

impl Item {
    pub fn is_video(&self) -> bool {
        self.asset_type == "video"
    }
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    #[serde(default)]
    pub claimed: bool,
    #[serde(default)]
    pub claim_code: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub has_manifest: bool,
    #[serde(default)]
    pub playlist_id: Option<String>,
    #[serde(default)]
    pub volume: i64,
    #[serde(default)]
    pub orientation: i64,
    #[serde(default)]
    pub start_item_id: Option<String>,
    #[serde(default)]
    pub pending_items: u32,
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default)]
    pub wifi: Option<WifiStatus>,
    /// QR modules for the dashboard link that adds this screen with its code
    /// filled in. Older agents send none.
    #[serde(default)]
    pub claim_qr: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackReport {
    pub asset_id: String,
    pub playlist_id: Option<String>,
    pub state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_seconds: Option<f64>,
}

#[derive(Debug, Serialize)]
struct WifiConfigureRequest<'a> {
    ssid: &'a str,
    password: &'a str,
}

#[derive(Debug)]
pub enum StateError {
    /// The agent predates the native player endpoint.
    NotFound,
    Other(String),
}

impl std::fmt::Display for StateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StateError::NotFound => f.write_str("agent has no /local/player/state endpoint"),
            StateError::Other(message) => f.write_str(message),
        }
    }
}

#[derive(Clone)]
pub struct Client {
    address: SocketAddr,
    host: String,
}

pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

impl Client {
    /// Accepts "http://127.0.0.1:4173" or "127.0.0.1:4173".
    pub fn new(base_url: &str) -> Result<Self, String> {
        let host = base_url
            .trim()
            .trim_start_matches("http://")
            .trim_end_matches('/')
            .to_string();
        let address = host
            .to_socket_addrs()
            .map_err(|error| format!("invalid agent address {host}: {error}"))?
            .next()
            .ok_or_else(|| format!("agent address {host} did not resolve"))?;
        Ok(Self { address, host })
    }

    fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&[u8]>,
        timeout: Duration,
    ) -> Result<Response, String> {
        let mut stream = TcpStream::connect_timeout(&self.address, Duration::from_secs(2))
            .map_err(|e| e.to_string())?;
        stream
            .set_read_timeout(Some(timeout))
            .map_err(|e| e.to_string())?;
        stream
            .set_write_timeout(Some(Duration::from_secs(2)))
            .map_err(|e| e.to_string())?;

        // HTTP/1.0 makes Go's server close the connection instead of using
        // chunked encoding, so the body is simply everything after the headers.
        let mut head = format!(
            "{method} {path} HTTP/1.0\r\nHost: {}\r\nAccept: application/json\r\n",
            self.host
        );
        if let Some(body) = body {
            head.push_str(&format!(
                "Content-Type: application/json\r\nContent-Length: {}\r\n",
                body.len()
            ));
        }
        head.push_str("\r\n");
        stream
            .write_all(head.as_bytes())
            .map_err(|e| e.to_string())?;
        if let Some(body) = body {
            stream.write_all(body).map_err(|e| e.to_string())?;
        }

        let mut raw = Vec::new();
        stream.read_to_end(&mut raw).map_err(|e| e.to_string())?;
        parse_response(&raw)
    }

    pub fn player_state(&self) -> Result<PlayerState, StateError> {
        let response = self
            .request("GET", "/local/player/state", None, Duration::from_secs(8))
            .map_err(StateError::Other)?;
        if response.status == 404 {
            return Err(StateError::NotFound);
        }
        if response.status != 200 {
            return Err(StateError::Other(format!(
                "player state returned HTTP {}",
                response.status
            )));
        }
        serde_json::from_slice(&response.body)
            .map_err(|e| StateError::Other(format!("invalid player state: {e}")))
    }

    pub fn report_playback(&self, report: &PlaybackReport) -> Result<(), String> {
        let body = serde_json::to_vec(report).map_err(|e| e.to_string())?;
        let response = self.request(
            "POST",
            "/local/playback",
            Some(&body),
            Duration::from_secs(3),
        )?;
        if response.status >= 300 {
            return Err(format!("playback report returned HTTP {}", response.status));
        }
        Ok(())
    }

    pub fn configure_wifi(&self, ssid: &str, password: &str) -> Result<WifiStatus, String> {
        let body = serde_json::to_vec(&WifiConfigureRequest { ssid, password })
            .map_err(|e| e.to_string())?;
        let response = self.request(
            "POST",
            "/local/wifi/configure",
            Some(&body),
            Duration::from_secs(60),
        )?;
        if response.status != 200 {
            let message = String::from_utf8_lossy(&response.body).trim().to_string();
            return Err(if message.is_empty() {
                format!("Wi-Fi setup failed (HTTP {})", response.status)
            } else {
                message
            });
        }
        serde_json::from_slice(&response.body).map_err(|e| format!("invalid Wi-Fi status: {e}"))
    }
}

pub fn parse_response(raw: &[u8]) -> Result<Response, String> {
    let split = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "incomplete HTTP response".to_string())?;
    let head = String::from_utf8_lossy(&raw[..split]);
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse().ok())
        .ok_or_else(|| "missing HTTP status".to_string())?;
    Ok(Response {
        status,
        body: raw[split + 4..].to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_status_and_body() {
        let response = parse_response(
            b"HTTP/1.0 200 OK\r\nContent-Type: application/json\r\n\r\n{\"claimed\":true}",
        )
        .unwrap();
        assert_eq!(response.status, 200);
        let state: PlayerState = serde_json::from_slice(&response.body).unwrap();
        assert!(state.claimed);
        assert!(state.items.is_empty());
    }

    #[test]
    fn rejects_truncated_responses() {
        assert!(parse_response(b"HTTP/1.0 200 OK\r\n").is_err());
    }

    #[test]
    fn decodes_agent_player_state() {
        let payload = br#"{"claimed":true,"hasManifest":true,"playlistId":"p1","volume":40,"orientation":90,
            "startItemId":"i2","pendingItems":1,
            "items":[{"id":"i1","assetId":"a1","assetType":"video","title":"Intro","localPath":"/c/a.mp4"},
                     {"id":"i2","assetId":"a2","assetType":"image","title":"Promo","localPath":"/c/b.jpg","durationSeconds":8}]}"#;
        let state: PlayerState = serde_json::from_slice(payload).unwrap();
        assert_eq!(state.items.len(), 2);
        assert_eq!(state.items[1].duration_seconds, Some(8));
        assert!(state.items[0].is_video());
        assert_eq!(state.start_item_id.as_deref(), Some("i2"));
    }

    #[test]
    fn decodes_wifi_setup_details() {
        let payload = br#"{"supported":true,"connected":false,"interface":"wlan0",
            "networks":[{"ssid":"Guest","signal":80,"security":"WPA2","secure":true},{"ssid":"Lobby","signal":40,"secure":false}],
            "hotspot":{"ssid":"Showroom-AB12","password":"abcd2345","url":"http://10.42.0.1/","joinQr":["101","010","101"],"pageQr":["1"]},
            "connecting":true,"lastAttempt":{"ssid":"Guest","ok":false,"message":"Check the password","at":"2026-10-22T12:00:00Z"}}"#;
        let wifi: WifiStatus = serde_json::from_slice(payload).unwrap();
        assert_eq!(wifi.networks.len(), 2);
        assert!(wifi.networks[0].secure);
        assert_eq!(wifi.hotspot.unwrap().join_qr.len(), 3);
        assert!(wifi.connecting);
        assert!(!wifi.last_attempt.unwrap().ok);

        let old: WifiStatus =
            serde_json::from_slice(br#"{"supported":true,"connected":false}"#).unwrap();
        assert!(old.networks.is_empty() && old.hotspot.is_none());
    }

    #[test]
    fn omits_position_for_reports_without_one() {
        let report = PlaybackReport {
            asset_id: "a1".into(),
            playlist_id: None,
            state: "playing",
            position_seconds: None,
        };
        assert_eq!(
            serde_json::to_string(&report).unwrap(),
            r#"{"assetId":"a1","playlistId":null,"state":"playing"}"#
        );
    }
}
