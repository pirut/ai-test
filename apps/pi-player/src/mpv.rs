//! Minimal libmpv client binding, loaded with dlopen at runtime.
//!
//! Loading libmpv dynamically keeps the binary cross-compilable without an
//! arm64 libmpv sysroot and lets the launcher fall back to the legacy kiosk
//! when the library is missing from the OS image.

use std::ffi::{c_char, c_double, c_int, c_void, CStr, CString};
use std::fmt;
use std::ptr;

pub const FORMAT_STRING: c_int = 1;
pub const FORMAT_FLAG: c_int = 3;
pub const FORMAT_INT64: c_int = 4;
pub const FORMAT_DOUBLE: c_int = 5;

const EVENT_SHUTDOWN: c_int = 1;
const EVENT_LOG_MESSAGE: c_int = 2;
const EVENT_START_FILE: c_int = 6;
const EVENT_END_FILE: c_int = 7;
const EVENT_FILE_LOADED: c_int = 8;
const EVENT_PLAYBACK_RESTART: c_int = 21;
const EVENT_PROPERTY_CHANGE: c_int = 22;

pub const END_FILE_REASON_ERROR: c_int = 4;

#[repr(C)]
struct RawEvent {
    event_id: c_int,
    error: c_int,
    reply_userdata: u64,
    data: *mut c_void,
}

#[repr(C)]
struct RawEventProperty {
    name: *const c_char,
    format: c_int,
    data: *mut c_void,
}

#[repr(C)]
struct RawEventEndFile {
    reason: c_int,
    error: c_int,
}

#[repr(C)]
struct RawEventLogMessage {
    prefix: *const c_char,
    level: *const c_char,
    text: *const c_char,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PropertyValue {
    None,
    Flag(bool),
    Int(i64),
    Double(f64),
    Str(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Shutdown,
    Log {
        prefix: String,
        level: String,
        text: String,
    },
    StartFile,
    EndFile {
        reason: i32,
        error: i32,
    },
    FileLoaded,
    PlaybackRestart,
    PropertyChange {
        name: String,
        value: PropertyValue,
    },
    Other(i32),
}

#[derive(Debug)]
pub struct Error(pub String);

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

type Handle = *mut c_void;

struct Api {
    create: unsafe extern "C" fn() -> Handle,
    initialize: unsafe extern "C" fn(Handle) -> c_int,
    terminate_destroy: unsafe extern "C" fn(Handle),
    set_option_string: unsafe extern "C" fn(Handle, *const c_char, *const c_char) -> c_int,
    set_property: unsafe extern "C" fn(Handle, *const c_char, c_int, *mut c_void) -> c_int,
    get_property: unsafe extern "C" fn(Handle, *const c_char, c_int, *mut c_void) -> c_int,
    command: unsafe extern "C" fn(Handle, *mut *const c_char) -> c_int,
    observe_property: unsafe extern "C" fn(Handle, u64, *const c_char, c_int) -> c_int,
    wait_event: unsafe extern "C" fn(Handle, c_double) -> *mut RawEvent,
    request_log_messages: unsafe extern "C" fn(Handle, *const c_char) -> c_int,
    error_string: unsafe extern "C" fn(c_int) -> *const c_char,
    free: unsafe extern "C" fn(*mut c_void),
}

unsafe fn symbol<T: Copy>(library: *mut c_void, name: &str) -> Result<T, Error> {
    let cname = CString::new(name).expect("symbol name");
    let pointer = libc::dlsym(library, cname.as_ptr());
    if pointer.is_null() {
        return Err(Error(format!("libmpv is missing {name}")));
    }
    Ok(std::mem::transmute_copy(&pointer))
}

impl Api {
    fn load() -> Result<Self, Error> {
        let mut library = ptr::null_mut();
        for name in ["libmpv.so.2", "libmpv.so.1", "libmpv.so"] {
            let cname = CString::new(name).expect("library name");
            library = unsafe { libc::dlopen(cname.as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL) };
            if !library.is_null() {
                break;
            }
        }
        if library.is_null() {
            return Err(Error(
                "libmpv is not installed (libmpv.so.2 not found)".into(),
            ));
        }
        unsafe {
            Ok(Self {
                create: symbol(library, "mpv_create")?,
                initialize: symbol(library, "mpv_initialize")?,
                terminate_destroy: symbol(library, "mpv_terminate_destroy")?,
                set_option_string: symbol(library, "mpv_set_option_string")?,
                set_property: symbol(library, "mpv_set_property")?,
                get_property: symbol(library, "mpv_get_property")?,
                command: symbol(library, "mpv_command")?,
                observe_property: symbol(library, "mpv_observe_property")?,
                wait_event: symbol(library, "mpv_wait_event")?,
                request_log_messages: symbol(library, "mpv_request_log_messages")?,
                error_string: symbol(library, "mpv_error_string")?,
                free: symbol(library, "mpv_free")?,
            })
        }
    }
}

pub struct Mpv {
    api: Api,
    handle: Handle,
}

fn cstring(value: &str) -> CString {
    // Interior NULs cannot be passed to libmpv; they never appear in paths or
    // overlay text we generate, so dropping them is safe.
    CString::new(value.replace('\0', "")).expect("NUL bytes were removed")
}

unsafe fn owned_string(pointer: *const c_char) -> String {
    if pointer.is_null() {
        return String::new();
    }
    CStr::from_ptr(pointer).to_string_lossy().into_owned()
}

impl Mpv {
    /// Creates an uninitialized mpv handle. Set options, then call `initialize`.
    pub fn create() -> Result<Self, Error> {
        let api = Api::load()?;
        let handle = unsafe { (api.create)() };
        if handle.is_null() {
            return Err(Error("mpv_create failed".into()));
        }
        Ok(Self { api, handle })
    }

    fn check(&self, code: c_int, what: &str) -> Result<(), Error> {
        if code >= 0 {
            return Ok(());
        }
        let message = unsafe { owned_string((self.api.error_string)(code)) };
        Err(Error(format!("{what}: {message}")))
    }

    pub fn set_option(&self, name: &str, value: &str) -> Result<(), Error> {
        let (cname, cvalue) = (cstring(name), cstring(value));
        let code =
            unsafe { (self.api.set_option_string)(self.handle, cname.as_ptr(), cvalue.as_ptr()) };
        self.check(code, &format!("option {name}={value}"))
    }

    pub fn initialize(&self) -> Result<(), Error> {
        let code = unsafe { (self.api.initialize)(self.handle) };
        self.check(code, "mpv_initialize")
    }

    pub fn request_log_messages(&self, level: &str) -> Result<(), Error> {
        let clevel = cstring(level);
        let code = unsafe { (self.api.request_log_messages)(self.handle, clevel.as_ptr()) };
        self.check(code, "request_log_messages")
    }

    pub fn command(&self, args: &[&str]) -> Result<(), Error> {
        let owned: Vec<CString> = args.iter().map(|arg| cstring(arg)).collect();
        let mut pointers: Vec<*const c_char> = owned.iter().map(|arg| arg.as_ptr()).collect();
        pointers.push(ptr::null());
        let code = unsafe { (self.api.command)(self.handle, pointers.as_mut_ptr()) };
        self.check(
            code,
            &format!("command {}", args.first().copied().unwrap_or("")),
        )
    }

    pub fn set_string(&self, name: &str, value: &str) -> Result<(), Error> {
        let cname = cstring(name);
        let cvalue = cstring(value);
        let mut pointer = cvalue.as_ptr();
        let code = unsafe {
            (self.api.set_property)(
                self.handle,
                cname.as_ptr(),
                FORMAT_STRING,
                &mut pointer as *mut _ as *mut c_void,
            )
        };
        self.check(code, &format!("set {name}={value}"))
    }

    pub fn set_flag(&self, name: &str, value: bool) -> Result<(), Error> {
        let cname = cstring(name);
        let mut flag: c_int = value.into();
        let code = unsafe {
            (self.api.set_property)(
                self.handle,
                cname.as_ptr(),
                FORMAT_FLAG,
                &mut flag as *mut _ as *mut c_void,
            )
        };
        self.check(code, &format!("set {name}={value}"))
    }

    pub fn set_double(&self, name: &str, value: f64) -> Result<(), Error> {
        let cname = cstring(name);
        let mut number = value;
        let code = unsafe {
            (self.api.set_property)(
                self.handle,
                cname.as_ptr(),
                FORMAT_DOUBLE,
                &mut number as *mut _ as *mut c_void,
            )
        };
        self.check(code, &format!("set {name}={value}"))
    }

    pub fn get_string(&self, name: &str) -> Option<String> {
        let cname = cstring(name);
        let mut pointer: *mut c_char = ptr::null_mut();
        let code = unsafe {
            (self.api.get_property)(
                self.handle,
                cname.as_ptr(),
                FORMAT_STRING,
                &mut pointer as *mut _ as *mut c_void,
            )
        };
        if code < 0 || pointer.is_null() {
            return None;
        }
        let value = unsafe { owned_string(pointer) };
        unsafe { (self.api.free)(pointer as *mut c_void) };
        Some(value)
    }

    pub fn observe(&self, name: &str, format: c_int) -> Result<(), Error> {
        let cname = cstring(name);
        let code = unsafe { (self.api.observe_property)(self.handle, 0, cname.as_ptr(), format) };
        self.check(code, &format!("observe {name}"))
    }

    /// Waits up to `timeout` seconds for the next event. Returns None on timeout.
    pub fn wait_event(&self, timeout: f64) -> Option<Event> {
        let raw = unsafe { (self.api.wait_event)(self.handle, timeout) };
        if raw.is_null() {
            return None;
        }
        let raw = unsafe { &*raw };
        let event = match raw.event_id {
            0 => return None,
            EVENT_SHUTDOWN => Event::Shutdown,
            EVENT_START_FILE => Event::StartFile,
            EVENT_FILE_LOADED => Event::FileLoaded,
            EVENT_PLAYBACK_RESTART => Event::PlaybackRestart,
            EVENT_END_FILE => {
                let data = unsafe { &*(raw.data as *const RawEventEndFile) };
                Event::EndFile {
                    reason: data.reason,
                    error: data.error,
                }
            }
            EVENT_LOG_MESSAGE => {
                let data = unsafe { &*(raw.data as *const RawEventLogMessage) };
                unsafe {
                    Event::Log {
                        prefix: owned_string(data.prefix),
                        level: owned_string(data.level),
                        text: owned_string(data.text).trim_end().to_string(),
                    }
                }
            }
            EVENT_PROPERTY_CHANGE => {
                let data = unsafe { &*(raw.data as *const RawEventProperty) };
                let name = unsafe { owned_string(data.name) };
                let value = unsafe { read_property(data.format, data.data) };
                Event::PropertyChange { name, value }
            }
            other => Event::Other(other),
        };
        Some(event)
    }
}

unsafe fn read_property(format: c_int, data: *mut c_void) -> PropertyValue {
    if data.is_null() {
        return PropertyValue::None;
    }
    match format {
        FORMAT_FLAG => PropertyValue::Flag(*(data as *const c_int) != 0),
        FORMAT_INT64 => PropertyValue::Int(*(data as *const i64)),
        FORMAT_DOUBLE => PropertyValue::Double(*(data as *const f64)),
        FORMAT_STRING => PropertyValue::Str(owned_string(*(data as *const *const c_char))),
        _ => PropertyValue::None,
    }
}

impl Drop for Mpv {
    fn drop(&mut self) {
        unsafe { (self.api.terminate_destroy)(self.handle) };
    }
}

/// Parses "mpv 0.40.0", "mpv v0.38.0-dirty" and similar into (major, minor).
pub fn parse_version(value: &str) -> Option<(u32, u32)> {
    let version = value.split_whitespace().nth(1)?.trim_start_matches('v');
    let mut parts = version.split(|c: char| !c.is_ascii_digit());
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    Some((major, minor))
}

#[cfg(test)]
mod tests {
    use super::parse_version;

    #[test]
    fn parses_release_and_git_versions() {
        assert_eq!(parse_version("mpv 0.40.0"), Some((0, 40)));
        assert_eq!(parse_version("mpv v0.38.0-dirty Copyright"), Some((0, 38)));
        assert_eq!(parse_version("mpv"), None);
    }
}
