//! Keyboard input from the kiosk's virtual terminal.
//!
//! The kiosk service runs with tty7 as stdin. Putting it in non-canonical,
//! no-echo mode gives us keystrokes for the Wi-Fi form without evdev access.

use std::io::Read;
use std::sync::mpsc::Sender;
use std::thread;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Key {
    Char(char),
    Backspace,
    Enter,
    Tab,
    Escape,
    Up,
    Down,
}

/// Restores the terminal mode on drop.
pub struct RawTerminal {
    original: libc::termios,
}

impl RawTerminal {
    pub fn enable() -> Option<Self> {
        unsafe {
            if libc::isatty(libc::STDIN_FILENO) != 1 {
                return None;
            }
            let mut original: libc::termios = std::mem::zeroed();
            if libc::tcgetattr(libc::STDIN_FILENO, &mut original) != 0 {
                return None;
            }
            let mut raw = original;
            raw.c_lflag &= !(libc::ICANON | libc::ECHO | libc::ISIG | libc::IEXTEN);
            raw.c_iflag &= !(libc::IXON | libc::ICRNL);
            raw.c_cc[libc::VMIN] = 1;
            raw.c_cc[libc::VTIME] = 0;
            if libc::tcsetattr(libc::STDIN_FILENO, libc::TCSANOW, &raw) != 0 {
                return None;
            }
            Some(Self { original })
        }
    }
}

impl Drop for RawTerminal {
    fn drop(&mut self) {
        unsafe {
            libc::tcsetattr(libc::STDIN_FILENO, libc::TCSANOW, &self.original);
        }
    }
}

/// Incremental decoder for terminal bytes (UTF-8 plus a few escape sequences).
#[derive(Default)]
pub struct Decoder {
    pending: Vec<u8>,
}

impl Decoder {
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<Key> {
        self.pending.extend_from_slice(bytes);
        let mut keys = Vec::new();
        while let Some(&first) = self.pending.first() {
            let consumed = match first {
                b'\r' | b'\n' => {
                    keys.push(Key::Enter);
                    1
                }
                b'\t' => {
                    keys.push(Key::Tab);
                    1
                }
                0x7f | 0x08 => {
                    keys.push(Key::Backspace);
                    1
                }
                0x1b => match self.escape_sequence() {
                    Some((key, used)) => {
                        if let Some(key) = key {
                            keys.push(key);
                        }
                        used
                    }
                    None => break,
                },
                byte if byte < 0x20 => 1,
                _ => match self.utf8_char() {
                    Some((ch, used)) => {
                        keys.push(Key::Char(ch));
                        used
                    }
                    None => break,
                },
            };
            self.pending.drain(..consumed);
        }
        keys
    }

    /// Parses ESC, ESC [ A/B and similar. Returns None if more bytes are needed.
    fn escape_sequence(&self) -> Option<(Option<Key>, usize)> {
        match self.pending.get(1) {
            None => Some((Some(Key::Escape), 1)),
            Some(b'[') | Some(b'O') => {
                let end = self.pending[2..]
                    .iter()
                    .position(|b| (0x40..=0x7e).contains(b))?;
                let key = match self.pending[2 + end] {
                    b'A' => Some(Key::Up),
                    b'B' => Some(Key::Down),
                    _ => None,
                };
                Some((key, end + 3))
            }
            Some(_) => Some((Some(Key::Escape), 1)),
        }
    }

    fn utf8_char(&self) -> Option<(char, usize)> {
        let width = match self.pending[0] {
            0x00..=0x7f => 1,
            0xc0..=0xdf => 2,
            0xe0..=0xef => 3,
            0xf0..=0xf7 => 4,
            _ => return Some(('\u{FFFD}', 1)),
        };
        if self.pending.len() < width {
            return None;
        }
        match std::str::from_utf8(&self.pending[..width]) {
            Ok(text) => text.chars().next().map(|ch| (ch, width)),
            Err(_) => Some(('\u{FFFD}', 1)),
        }
    }
}

pub fn spawn_reader(sender: Sender<Key>) {
    thread::spawn(move || {
        let mut stdin = std::io::stdin();
        let mut decoder = Decoder::default();
        let mut buffer = [0u8; 64];
        loop {
            match stdin.read(&mut buffer) {
                Ok(0) | Err(_) => return,
                Ok(count) => {
                    for key in decoder.feed(&buffer[..count]) {
                        if sender.send(key).is_err() {
                            return;
                        }
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_text_and_controls() {
        let mut decoder = Decoder::default();
        assert_eq!(
            decoder.feed(b"ab\t\x7f\r"),
            vec![
                Key::Char('a'),
                Key::Char('b'),
                Key::Tab,
                Key::Backspace,
                Key::Enter
            ]
        );
    }

    #[test]
    fn decodes_arrows_and_split_utf8() {
        let mut decoder = Decoder::default();
        assert_eq!(decoder.feed(b"\x1b[A\x1b[B"), vec![Key::Up, Key::Down]);
        let bytes = "é".as_bytes();
        assert!(decoder.feed(&bytes[..1]).is_empty());
        assert_eq!(decoder.feed(&bytes[1..]), vec![Key::Char('é')]);
    }

    #[test]
    fn lone_escape_is_escape() {
        let mut decoder = Decoder::default();
        assert_eq!(decoder.feed(b"\x1b"), vec![Key::Escape]);
    }
}
