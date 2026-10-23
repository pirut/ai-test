//! Keyboard-driven Wi-Fi picker for the setup screen.
//!
//! The screen lists the networks the agent scanned. Arrow keys choose one,
//! Enter joins it (asking for a password only when it is secured), and the
//! last row, "Other network…", types a name by hand. With no scan list (an
//! older agent, or nothing in range) the screen is the typed form.

use crate::agent::Network;
use crate::input::Key;

const MAX_FIELD_CHARS: usize = 64;
const MIN_PASSWORD_CHARS: usize = 8;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Field {
    #[default]
    Ssid,
    Password,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum Mode {
    /// Choosing from the scan list.
    #[default]
    List,
    /// Typing the password for the chosen network.
    Password,
    /// Typing a network name (and optional password).
    Manual,
}

/// The highlighted list row, kept by name so it stays put when a rescan
/// reorders the list.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum Cursor {
    #[default]
    First,
    Network(String),
    Other,
}

#[derive(Debug, Clone, Default)]
pub struct WifiForm {
    pub mode: Mode,
    pub cursor: Cursor,
    pub ssid: String,
    pub password: String,
    pub focus: Field,
    pub show_password: bool,
    pub saving: bool,
    pub message: Option<String>,
    pub message_is_error: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    None,
    Redraw,
    Submit { ssid: String, password: String },
}

impl WifiForm {
    /// The mode to draw: with nothing to pick from, the list is the typed form.
    pub fn view(&self, networks: &[Network]) -> Mode {
        if self.mode == Mode::List && networks.is_empty() {
            Mode::Manual
        } else {
            self.mode.clone()
        }
    }

    /// Index of the highlighted row; `networks.len()` is "Other network…".
    pub fn selected(&self, networks: &[Network]) -> usize {
        match &self.cursor {
            Cursor::First => 0,
            Cursor::Other => networks.len(),
            Cursor::Network(ssid) => networks
                .iter()
                .position(|network| &network.ssid == ssid)
                .unwrap_or(0),
        }
    }

    fn select(&mut self, index: usize, networks: &[Network]) {
        self.cursor = match networks.get(index) {
            Some(network) => Cursor::Network(network.ssid.clone()),
            None => Cursor::Other,
        };
    }

    pub fn handle(&mut self, key: Key, networks: &[Network]) -> Action {
        if self.saving {
            return Action::None;
        }
        match self.view(networks) {
            Mode::List => self.handle_list(key, networks),
            Mode::Password => self.handle_password(key),
            Mode::Manual => self.handle_manual(key, networks),
        }
    }

    fn handle_list(&mut self, key: Key, networks: &[Network]) -> Action {
        let selected = self.selected(networks);
        match key {
            Key::Up => self.select(selected.saturating_sub(1), networks),
            Key::Down | Key::Tab => self.select((selected + 1).min(networks.len()), networks),
            Key::Enter => match networks.get(selected) {
                Some(network) if network.secure => {
                    self.ssid = network.ssid.clone();
                    self.password.clear();
                    self.show_password = false;
                    self.message = None;
                    self.mode = Mode::Password;
                }
                Some(network) => {
                    self.ssid = network.ssid.clone();
                    self.password.clear();
                    return self.submit();
                }
                None => {
                    self.ssid.clear();
                    self.password.clear();
                    self.focus = Field::Ssid;
                    self.message = None;
                    self.mode = Mode::Manual;
                }
            },
            Key::Escape => self.message = None,
            Key::Char(_) | Key::Backspace => return Action::None,
        }
        Action::Redraw
    }

    fn handle_password(&mut self, key: Key) -> Action {
        match key {
            Key::Char(ch) => push_limited(&mut self.password, ch),
            Key::Backspace => {
                self.password.pop();
            }
            Key::Tab => self.show_password = !self.show_password,
            Key::Escape => {
                self.password.clear();
                self.message = None;
                self.mode = Mode::List;
            }
            Key::Enter => {
                if self.password.chars().count() < MIN_PASSWORD_CHARS {
                    self.set_message("Wi-Fi passwords are at least 8 characters.", true);
                    return Action::Redraw;
                }
                return self.submit();
            }
            Key::Up | Key::Down => return Action::None,
        }
        Action::Redraw
    }

    fn handle_manual(&mut self, key: Key, networks: &[Network]) -> Action {
        match key {
            Key::Char(ch) => push_limited(self.field_mut(), ch),
            Key::Backspace => {
                self.field_mut().pop();
            }
            Key::Tab | Key::Up | Key::Down => self.toggle_focus(),
            Key::Escape => {
                if networks.is_empty() {
                    self.field_mut().clear();
                    self.message = None;
                } else {
                    self.message = None;
                    self.mode = Mode::List;
                }
            }
            Key::Enter => {
                if self.focus == Field::Ssid {
                    self.focus = Field::Password;
                    return Action::Redraw;
                }
                let ssid = self.ssid.trim().to_string();
                if ssid.is_empty() {
                    self.set_message("Enter the Wi-Fi name.", true);
                    self.focus = Field::Ssid;
                    return Action::Redraw;
                }
                let length = self.password.chars().count();
                if length > 0 && length < MIN_PASSWORD_CHARS {
                    self.set_message(
                        "Wi-Fi passwords are at least 8 characters. Leave it empty for an open network.",
                        true,
                    );
                    return Action::Redraw;
                }
                self.ssid = ssid;
                return self.submit();
            }
        }
        Action::Redraw
    }

    fn field_mut(&mut self) -> &mut String {
        match self.focus {
            Field::Ssid => &mut self.ssid,
            Field::Password => &mut self.password,
        }
    }

    fn toggle_focus(&mut self) {
        self.focus = match self.focus {
            Field::Ssid => Field::Password,
            Field::Password => Field::Ssid,
        };
    }

    fn submit(&mut self) -> Action {
        self.saving = true;
        let message = format!("Connecting to {}…", self.ssid);
        self.set_message(&message, false);
        Action::Submit {
            ssid: self.ssid.clone(),
            password: self.password.clone(),
        }
    }

    pub fn set_message(&mut self, message: &str, is_error: bool) {
        self.message = Some(message.to_string());
        self.message_is_error = is_error;
    }

    pub fn finish(&mut self, result: Result<(bool, Option<String>), String>) {
        self.saving = false;
        match result {
            Ok((connected, ssid)) => {
                let name = ssid.unwrap_or_else(|| self.ssid.clone());
                let message = if connected {
                    format!("Connected to {name}. Waiting for claim code…")
                } else {
                    "Credentials saved. Waiting for the network…".to_string()
                };
                self.set_message(&message, false);
                self.password.clear();
                self.mode = Mode::List;
            }
            Err(error) => self.set_message(&error, true),
        }
    }
}

fn push_limited(field: &mut String, ch: char) {
    if field.chars().count() < MAX_FIELD_CHARS {
        field.push(ch);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn type_text(form: &mut WifiForm, text: &str, networks: &[Network]) {
        for ch in text.chars() {
            form.handle(Key::Char(ch), networks);
        }
    }

    fn networks() -> Vec<Network> {
        vec![
            Network {
                ssid: "Guest".into(),
                signal: 80,
                secure: true,
                in_use: false,
            },
            Network {
                ssid: "Lobby".into(),
                signal: 40,
                secure: false,
                in_use: false,
            },
        ]
    }

    #[test]
    fn picks_a_secured_network_and_asks_for_its_password() {
        let list = networks();
        let mut form = WifiForm::default();
        assert_eq!(form.view(&list), Mode::List);
        assert_eq!(form.handle(Key::Enter, &list), Action::Redraw);
        assert_eq!(form.mode, Mode::Password);
        type_text(&mut form, "short", &list);
        assert_eq!(form.handle(Key::Enter, &list), Action::Redraw);
        assert!(form.message_is_error);
        type_text(&mut form, "word", &list);
        assert_eq!(
            form.handle(Key::Enter, &list),
            Action::Submit {
                ssid: "Guest".into(),
                password: "shortword".into()
            }
        );
        assert!(form.saving);
        assert_eq!(form.handle(Key::Char('x'), &list), Action::None);
    }

    #[test]
    fn open_network_joins_without_a_password() {
        let list = networks();
        let mut form = WifiForm::default();
        form.handle(Key::Down, &list);
        assert_eq!(
            form.handle(Key::Enter, &list),
            Action::Submit {
                ssid: "Lobby".into(),
                password: String::new()
            }
        );
    }

    #[test]
    fn cursor_follows_the_network_when_the_list_reorders() {
        let mut list = networks();
        let mut form = WifiForm::default();
        form.handle(Key::Down, &list);
        assert_eq!(form.selected(&list), 1);
        list.reverse();
        assert_eq!(form.selected(&list), 0);
        assert_eq!(list[form.selected(&list)].ssid, "Lobby");
    }

    #[test]
    fn other_network_types_a_name_and_escape_goes_back() {
        let list = networks();
        let mut form = WifiForm::default();
        form.handle(Key::Down, &list);
        form.handle(Key::Down, &list);
        form.handle(Key::Down, &list);
        assert_eq!(form.selected(&list), 2);
        form.handle(Key::Enter, &list);
        assert_eq!(form.mode, Mode::Manual);
        type_text(&mut form, "Back Office", &list);
        form.handle(Key::Enter, &list);
        assert_eq!(
            form.handle(Key::Enter, &list),
            Action::Submit {
                ssid: "Back Office".into(),
                password: String::new()
            }
        );
        form.saving = false;
        form.handle(Key::Escape, &list);
        assert_eq!(form.mode, Mode::List);
    }

    #[test]
    fn without_a_scan_list_the_form_is_typed() {
        let mut form = WifiForm::default();
        assert_eq!(form.view(&[]), Mode::Manual);
        type_text(&mut form, "Shop", &[]);
        assert_eq!(form.handle(Key::Enter, &[]), Action::Redraw);
        type_text(&mut form, "pass1234", &[]);
        form.handle(Key::Backspace, &[]);
        type_text(&mut form, "5", &[]);
        assert_eq!(
            form.handle(Key::Enter, &[]),
            Action::Submit {
                ssid: "Shop".into(),
                password: "pass1235".into()
            }
        );
    }

    #[test]
    fn tab_reveals_the_password() {
        let list = networks();
        let mut form = WifiForm::default();
        form.handle(Key::Enter, &list);
        form.handle(Key::Tab, &list);
        assert!(form.show_password);
    }

    #[test]
    fn finish_reports_result_and_clears_password() {
        let mut form = WifiForm {
            ssid: "Shop".into(),
            password: "pw".into(),
            saving: true,
            mode: Mode::Password,
            ..Default::default()
        };
        form.finish(Ok((true, Some("Shop".into()))));
        assert!(!form.saving);
        assert!(form.password.is_empty());
        assert_eq!(form.mode, Mode::List);
        assert!(form.message.unwrap().contains("Connected to Shop"));
    }
}
