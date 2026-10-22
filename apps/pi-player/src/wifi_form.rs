//! Keyboard-driven Wi-Fi form for the setup screen.

use crate::input::Key;

const MAX_FIELD_CHARS: usize = 64;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Field {
    #[default]
    Ssid,
    Password,
}

#[derive(Debug, Clone, Default)]
pub struct WifiForm {
    pub ssid: String,
    pub password: String,
    pub focus: Field,
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

    pub fn handle(&mut self, key: Key) -> Action {
        if self.saving {
            return Action::None;
        }
        match key {
            Key::Char(ch) => {
                let field = self.field_mut();
                if field.chars().count() >= MAX_FIELD_CHARS {
                    return Action::None;
                }
                field.push(ch);
            }
            Key::Backspace => {
                self.field_mut().pop();
            }
            Key::Tab | Key::Up | Key::Down => self.toggle_focus(),
            Key::Escape => {
                self.field_mut().clear();
                self.message = None;
            }
            Key::Enter => {
                if self.focus == Field::Ssid {
                    self.focus = Field::Password;
                    return Action::Redraw;
                }
                let ssid = self.ssid.trim().to_string();
                if ssid.is_empty() || self.password.is_empty() {
                    self.set_message("Enter the Wi-Fi name and password.", true);
                    self.focus = if ssid.is_empty() {
                        Field::Ssid
                    } else {
                        Field::Password
                    };
                    return Action::Redraw;
                }
                self.saving = true;
                self.set_message("Connecting…", false);
                return Action::Submit {
                    ssid,
                    password: self.password.clone(),
                };
            }
        }
        Action::Redraw
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
            }
            Err(error) => self.set_message(&error, true),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn type_text(form: &mut WifiForm, text: &str) {
        for ch in text.chars() {
            form.handle(Key::Char(ch));
        }
    }

    #[test]
    fn types_into_fields_and_submits() {
        let mut form = WifiForm::default();
        type_text(&mut form, "Shop");
        assert_eq!(form.handle(Key::Enter), Action::Redraw);
        type_text(&mut form, "pass1");
        form.handle(Key::Backspace);
        assert_eq!(
            form.handle(Key::Enter),
            Action::Submit {
                ssid: "Shop".into(),
                password: "pass".into()
            }
        );
        assert!(form.saving);
        assert_eq!(form.handle(Key::Char('x')), Action::None);
    }

    #[test]
    fn refuses_empty_password() {
        let mut form = WifiForm::default();
        type_text(&mut form, "Shop");
        form.handle(Key::Tab);
        assert_eq!(form.handle(Key::Enter), Action::Redraw);
        assert!(form.message_is_error);
        assert!(!form.saving);
    }

    #[test]
    fn finish_reports_result_and_clears_password() {
        let mut form = WifiForm {
            ssid: "Shop".into(),
            password: "pw".into(),
            saving: true,
            ..Default::default()
        };
        form.finish(Ok((true, Some("Shop".into()))));
        assert!(!form.saving);
        assert!(form.password.is_empty());
        assert!(form.message.unwrap().contains("Connected to Shop"));
    }
}
