//! Showroom native player for Raspberry Pi.
//!
//! Renders images, video and the setup screens with libmpv straight to
//! DRM/KMS, replacing Chromium, X11 and the bash/Python kiosk supervisor. The
//! showroom-agent stays in charge of sync and caching; this program asks it for
//! the cached playlist over loopback HTTP and reports playback back to it.

mod agent;
mod input;
mod mpv;
mod playlist;
mod screens;
mod system;
mod wifi_form;

use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::mpsc::{self, Receiver, Sender, SyncSender, TryRecvError};
use std::thread;
use std::time::{Duration, Instant};

use agent::{Item, PlaybackReport, PlayerState, WifiStatus};
use input::Key;
use mpv::{Event, Mpv, PropertyValue};
use screens::Screen;
use wifi_form::{Action, WifiForm};

/// Exit status the launcher treats as "native playback unavailable on this
/// device", so it can fall back to the legacy kiosk (sysexits EX_CONFIG).
const EXIT_UNAVAILABLE: i32 = 78;
const OVERLAY_ID: &str = "1";
const REPORT_INTERVAL: Duration = Duration::from_secs(10);
const STALL_AFTER: Duration = Duration::from_secs(20);
const IDLE_RELOAD_BACKOFF: Duration = Duration::from_secs(5);

struct Config {
    agent_url: String,
    display_mode: String,
    drm_connector: String,
    drm_device: String,
    hwdec: String,
    vo: String,
    audio_device: Option<String>,
    runtime_dir: PathBuf,
    poll_interval: Duration,
}

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default.to_string())
}

impl Config {
    fn from_env() -> Self {
        let runtime_dir =
            std::env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| "/run/showroom-kiosk".into());
        Self {
            agent_url: env_or("SHOWROOM_AGENT_URL", "http://127.0.0.1:4173"),
            // 1080p matches the media spec and keeps composition cheap; set
            // SHOWROOM_DISPLAY_MODE=preferred to use the monitor's native mode.
            display_mode: env_or("SHOWROOM_DISPLAY_MODE", "1920x1080"),
            drm_connector: env_or("SHOWROOM_DRM_CONNECTOR", ""),
            drm_device: env_or("SHOWROOM_DRM_DEVICE", ""),
            hwdec: env_or("SHOWROOM_HWDEC", "auto-safe"),
            vo: env_or("SHOWROOM_MPV_VO", "gpu"),
            audio_device: std::env::var("SHOWROOM_AUDIO_DEVICE")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            runtime_dir: PathBuf::from(env_or("SHOWROOM_PLAYER_RUNTIME_DIR", &runtime_dir)),
            poll_interval: Duration::from_millis(
                env_or("SHOWROOM_PLAYER_POLL_MS", "2000")
                    .parse()
                    .unwrap_or(2000),
            ),
        }
    }
}

enum Msg {
    State(Result<PlayerState, String>),
    Wifi(Result<WifiStatus, String>),
}

enum Job {
    Report(PlaybackReport),
    Wifi { ssid: String, password: String },
}

fn start_mpv(config: &Config) -> Result<Mpv, mpv::Error> {
    let mpv = Mpv::create()?;
    let required = [
        ("vo", config.vo.as_str()),
        ("hwdec", config.hwdec.as_str()),
        ("idle", "yes"),
        ("force-window", "yes"),
        ("keep-open", "no"),
        ("loop-playlist", "inf"),
        ("image-display-duration", "10"),
        ("prefetch-playlist", "yes"),
        ("osc", "no"),
        ("input-default-bindings", "no"),
        ("input-vo-keyboard", "no"),
        ("terminal", "no"),
        ("audio-display", "no"),
        ("screenshot-format", "jpg"),
        ("screenshot-jpeg-quality", "85"),
    ];
    for (name, value) in required {
        mpv.set_option(name, value)?;
    }
    if config.vo == "gpu" || config.vo == "gpu-next" {
        mpv.set_option("gpu-context", "drm")?;
    }
    let optional = [
        ("profile", "fast"),
        ("background-color", "#030608"),
        ("drm-mode", config.display_mode.as_str()),
        ("drm-connector", config.drm_connector.as_str()),
        ("drm-device", config.drm_device.as_str()),
    ];
    for (name, value) in optional {
        if value.is_empty() {
            continue;
        }
        if let Err(error) = mpv.set_option(name, value) {
            eprintln!("showroom-player: ignoring {error}");
        }
    }
    let audio = config
        .audio_device
        .clone()
        .or_else(|| system::detect_hdmi_audio_device(std::path::Path::new("/proc/asound")));
    if let Some(device) = audio {
        eprintln!("showroom-player: routing audio to {device}");
        mpv.set_option("audio-device", &device)?;
    }

    mpv.initialize()?;
    let _ = mpv.request_log_messages("warn");
    mpv.observe("time-pos", mpv::FORMAT_DOUBLE)?;
    mpv.observe("idle-active", mpv::FORMAT_FLAG)?;
    Ok(mpv)
}

/// Waits for mpv to open its video output (the DRM display).
fn wait_for_video_output(mpv: &Mpv, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if mpv
            .get_string("current-vo")
            .is_some_and(|vo| !vo.is_empty())
        {
            return true;
        }
        if let Some(Event::Log {
            prefix,
            level,
            text,
        }) = mpv.wait_event(0.2)
        {
            eprintln!("mpv[{prefix}] {level}: {text}");
        }
    }
    false
}

/// False only when the agent answers but does not know the endpoint (404).
/// Connection errors count as supported: the agent may just be restarting,
/// and the player keeps polling it.
fn agent_supports_native_player(client: &agent::Client) -> bool {
    for _ in 0..5 {
        match client.player_state() {
            Ok(_) => return true,
            Err(agent::StateError::NotFound) => return false,
            Err(agent::StateError::Other(_)) => thread::sleep(Duration::from_secs(2)),
        }
    }
    true
}

fn spawn_agent_poller(client: agent::Client, interval: Duration, sender: Sender<Msg>) {
    thread::spawn(move || loop {
        let result = client.player_state().map_err(|error| error.to_string());
        // Wi-Fi status costs several nmcli calls on the agent side; it is only
        // included during first-time setup, so poll more gently then.
        let delay = match &result {
            Ok(state) if state.wifi.is_some() => interval.max(Duration::from_secs(5)),
            _ => interval,
        };
        if sender.send(Msg::State(result)).is_err() {
            return;
        }
        thread::sleep(delay);
    });
}

fn spawn_job_worker(client: agent::Client, jobs: Receiver<Job>, sender: Sender<Msg>) {
    thread::spawn(move || {
        for job in jobs {
            match job {
                Job::Report(report) => {
                    if let Err(error) = client.report_playback(&report) {
                        eprintln!("showroom-player: playback report failed: {error}");
                    }
                }
                Job::Wifi { ssid, password } => {
                    let result = client.configure_wifi(&ssid, &password);
                    if sender.send(Msg::Wifi(result)).is_err() {
                        return;
                    }
                }
            }
        }
    });
}

struct Player {
    mpv: Mpv,
    config: Config,
    jobs: SyncSender<Job>,
    loadfile_takes_index: bool,

    state: Option<PlayerState>,
    last_state_error: Option<String>,
    screen: Screen,
    overlay: Option<String>,
    form: WifiForm,

    applied: Vec<Item>,
    current: Option<Item>,
    started_at: Instant,
    time_pos: Option<f64>,
    last_progress_at: Instant,
    recovering: bool,
    recover_attempts: u32,
    last_report_at: Option<Instant>,
    idle: bool,
    reload_not_before: Instant,
    volume: Option<i64>,
    rotation: Option<i64>,
}

impl Player {
    fn new(mpv: Mpv, config: Config, jobs: SyncSender<Job>) -> Self {
        let version = mpv.get_string("mpv-version").unwrap_or_default();
        eprintln!("showroom-player: using {version}");
        // mpv 0.38 added an insertion index before loadfile's per-file options.
        let loadfile_takes_index = mpv::parse_version(&version).is_none_or(|v| v >= (0, 38));
        let now = Instant::now();
        Self {
            mpv,
            config,
            jobs,
            loadfile_takes_index,
            state: None,
            last_state_error: None,
            screen: Screen::Starting,
            overlay: None,
            form: WifiForm::default(),
            applied: Vec::new(),
            current: None,
            started_at: now,
            time_pos: None,
            last_progress_at: now,
            recovering: false,
            recover_attempts: 0,
            last_report_at: None,
            idle: true,
            reload_not_before: now,
            volume: None,
            rotation: None,
        }
    }

    fn run(&mut self, messages: Receiver<Msg>, keys: Receiver<Key>) {
        self.redraw();
        while !system::QUIT.load(Ordering::SeqCst) {
            let mut timeout = 0.1;
            while let Some(event) = self.mpv.wait_event(timeout) {
                timeout = 0.0;
                if !self.handle_event(event) {
                    return;
                }
            }
            loop {
                match messages.try_recv() {
                    Ok(Msg::State(result)) => self.on_state(result),
                    Ok(Msg::Wifi(result)) => {
                        self.form
                            .finish(result.map(|status| (status.connected, status.ssid)));
                        self.redraw();
                    }
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => return,
                }
            }
            while let Ok(key) = keys.try_recv() {
                self.on_key(key);
            }
            if system::SCREENSHOT.swap(false, Ordering::SeqCst) {
                self.screenshot();
            }
            self.tick();
        }
    }

    /// Returns false when mpv shut down.
    fn handle_event(&mut self, event: Event) -> bool {
        match event {
            Event::Shutdown => {
                eprintln!("showroom-player: mpv shut down");
                return false;
            }
            Event::Log {
                prefix,
                level,
                text,
            } => eprintln!("mpv[{prefix}] {level}: {text}"),
            Event::FileLoaded => self.on_file_loaded(),
            Event::EndFile { reason, error } if reason == mpv::END_FILE_REASON_ERROR => {
                let title = self
                    .current
                    .as_ref()
                    .map(|item| item.title.clone())
                    .unwrap_or_default();
                eprintln!("showroom-player: playback error {error} on {title:?}; mpv moves to the next item");
            }
            Event::PropertyChange { name, value } => match (name.as_str(), value) {
                ("time-pos", PropertyValue::Double(position)) => {
                    let advanced = self
                        .time_pos
                        .is_none_or(|last| position > last + 0.05 || position + 1.0 < last);
                    if advanced {
                        self.last_progress_at = Instant::now();
                        if self.recovering {
                            self.recovering = false;
                            self.redraw();
                        }
                        self.recover_attempts = 0;
                    }
                    self.time_pos = Some(position);
                }
                ("time-pos", _) => self.time_pos = None,
                ("idle-active", PropertyValue::Flag(idle)) => {
                    self.idle = idle;
                    if idle && self.screen == Screen::Playing && !self.applied.is_empty() {
                        // Every entry failed or mpv dropped the playlist; load
                        // it again on the next state update, with a backoff.
                        eprintln!(
                            "showroom-player: mpv went idle with a playlist loaded; reloading"
                        );
                        self.applied.clear();
                        self.current = None;
                        self.reload_not_before = Instant::now() + IDLE_RELOAD_BACKOFF;
                    }
                }
                _ => {}
            },
            _ => {}
        }
        true
    }

    fn on_file_loaded(&mut self) {
        let path = self.mpv.get_string("path").unwrap_or_default();
        self.current = self
            .applied
            .iter()
            .find(|item| item.local_path == path)
            .cloned();
        let now = Instant::now();
        self.started_at = now;
        self.last_progress_at = now;
        self.time_pos = self
            .current
            .as_ref()
            .filter(|item| item.is_video())
            .map(|_| 0.0);
        self.report();
    }

    fn on_state(&mut self, result: Result<PlayerState, String>) {
        let state = match result {
            Ok(state) => {
                self.last_state_error = None;
                state
            }
            Err(error) => {
                if self.last_state_error.as_deref() != Some(&error) {
                    eprintln!("showroom-player: agent unavailable: {error}");
                    self.last_state_error = Some(error);
                }
                return;
            }
        };

        let screen = screens::choose(Some(&state));
        if screen == Screen::Playing {
            if Instant::now() >= self.reload_not_before {
                self.sync_playlist(&state);
            }
        } else if !self.applied.is_empty() || !self.idle {
            self.command(&["stop"]);
            self.applied.clear();
            self.current = None;
        }

        if self.volume != Some(state.volume) {
            let volume = state.volume.clamp(0, 100);
            let _ = self.mpv.set_flag("mute", volume == 0);
            if volume > 0 {
                let _ = self.mpv.set_double("volume", volume as f64);
            }
            self.volume = Some(state.volume);
        }
        let rotation = state.orientation.rem_euclid(360) / 90 * 90;
        if self.rotation != Some(rotation) {
            if let Err(error) = self.mpv.set_string("video-rotate", &rotation.to_string()) {
                eprintln!("showroom-player: {error}");
            }
            self.rotation = Some(rotation);
        }

        let screen_changed = self.screen != screen;
        let wifi_changed = self.state.as_ref().map(|s| &s.wifi) != Some(&state.wifi);
        self.screen = screen;
        self.state = Some(state);
        if screen_changed || wifi_changed {
            self.redraw();
        }
    }

    fn sync_playlist(&mut self, state: &PlayerState) {
        // Ask mpv what is on screen rather than trusting the last FileLoaded:
        // during a transition mpv has already moved to the next entry, and
        // keeping the wrong one would queue the playlist out of order. With
        // nothing loaded, the playlist is replaced outright.
        let on_screen = self
            .mpv
            .get_string("path")
            .and_then(|path| self.applied.iter().find(|item| item.local_path == path));
        let current_key = on_screen.map(playlist::key);
        let Some(ops) = playlist::plan(
            current_key.as_deref(),
            &self.applied,
            &state.items,
            state.start_item_id.as_deref(),
        ) else {
            return;
        };
        for op in ops {
            match op {
                playlist::Op::ClearOthers => self.command(&["playlist-clear"]),
                playlist::Op::Replace(item) => self.loadfile(&item, "replace"),
                playlist::Op::Append(item) => self.loadfile(&item, "append"),
                playlist::Op::Stop => self.command(&["stop"]),
            }
        }
        // A single video loops in place instead of being reopened each time.
        let single_video = state.items.len() == 1 && state.items[0].is_video();
        let _ = self
            .mpv
            .set_string("loop-file", if single_video { "inf" } else { "no" });
        self.applied = state.items.clone();
    }

    fn loadfile(&self, item: &Item, flag: &str) {
        let options = if item.is_video() {
            String::new()
        } else {
            format!("image-display-duration={}", playlist::image_seconds(item))
        };
        let mut args = vec!["loadfile", item.local_path.as_str(), flag];
        if !options.is_empty() {
            if self.loadfile_takes_index {
                args.push("-1");
            }
            args.push(&options);
        }
        self.command(&args);
    }

    fn command(&self, args: &[&str]) {
        if let Err(error) = self.mpv.command(args) {
            eprintln!("showroom-player: {error}");
        }
    }

    fn on_key(&mut self, key: Key) {
        if self.screen != Screen::WifiSetup {
            return;
        }
        match self.form.handle(key) {
            Action::None => {}
            Action::Redraw => self.redraw(),
            Action::Submit { ssid, password } => {
                self.redraw();
                if self.jobs.try_send(Job::Wifi { ssid, password }).is_err() {
                    self.form
                        .finish(Err("The player is busy. Try again in a moment.".into()));
                    self.redraw();
                }
            }
        }
    }

    fn redraw(&mut self) {
        let state = self.state.as_ref();
        let mut events = screens::render(
            &self.screen,
            &self.form,
            state.and_then(|s| s.wifi.as_ref()),
            state.and_then(|s| s.last_error.as_deref()),
        );
        if self.screen == Screen::Playing && self.recovering {
            events = Some(screens::recovering_badge());
        }
        if events == self.overlay {
            return;
        }
        let (width, height) = (screens::WIDTH.to_string(), screens::HEIGHT.to_string());
        match events.as_deref() {
            Some(text) => self.command(&[
                "osd-overlay",
                OVERLAY_ID,
                "ass-events",
                text,
                &width,
                &height,
            ]),
            None => self.command(&["osd-overlay", OVERLAY_ID, "none", ""]),
        }
        self.overlay = events;
    }

    fn tick(&mut self) {
        let Some(item) = self.current.clone() else {
            return;
        };
        if self.screen != Screen::Playing {
            return;
        }
        if item.is_video() && !self.idle && self.last_progress_at.elapsed() > STALL_AFTER {
            self.recover_attempts += 1;
            self.recovering = true;
            self.last_progress_at = Instant::now();
            self.redraw();
            if self.applied.len() > 1 && self.recover_attempts >= 2 {
                eprintln!("showroom-player: {} stalled again; skipping it", item.title);
                self.command(&["playlist-next", "force"]);
                self.recover_attempts = 0;
            } else {
                eprintln!("showroom-player: {} stalled; reopening it", item.title);
                self.command(&["playlist-play-index", "current"]);
            }
            self.report();
        }
        if self
            .last_report_at
            .is_none_or(|at| at.elapsed() >= REPORT_INTERVAL)
        {
            self.report();
        }
    }

    fn report(&mut self) {
        let Some(item) = self.current.as_ref() else {
            return;
        };
        // Images have no media clock; report time on screen so the agent's
        // health check still sees progress.
        let position = if item.is_video() {
            self.time_pos
        } else {
            Some(self.started_at.elapsed().as_secs_f64())
        };
        let report = PlaybackReport {
            asset_id: item.asset_id.clone(),
            playlist_id: self.state.as_ref().and_then(|s| s.playlist_id.clone()),
            state: if self.recovering {
                "recovering"
            } else {
                "playing"
            },
            position_seconds: position,
        };
        let _ = self.jobs.try_send(Job::Report(report));
        self.last_report_at = Some(Instant::now());
    }

    fn screenshot(&self) {
        let target = self.config.runtime_dir.join("screenshot.jpg");
        let staging = self.config.runtime_dir.join("screenshot.next.jpg");
        let staging_str = staging.to_string_lossy().into_owned();
        match self
            .mpv
            .command(&["screenshot-to-file", &staging_str, "window"])
        {
            Ok(()) => {
                if let Err(error) = std::fs::rename(&staging, &target) {
                    eprintln!("showroom-player: screenshot rename failed: {error}");
                }
            }
            Err(error) => eprintln!("showroom-player: screenshot failed: {error}"),
        }
    }
}

fn main() {
    if std::env::args().any(|arg| arg == "--version") {
        println!("showroom-player {}", env!("CARGO_PKG_VERSION"));
        return;
    }

    if let Some(name) = std::env::args()
        .skip_while(|arg| arg != "--dump-screen")
        .nth(1)
    {
        // Prints a setup screen's ASS events, for previewing layouts off-device.
        let screen = match name.as_str() {
            "claim" => Screen::Claim {
                code: Some("K7Q2XM".into()),
            },
            "waiting" => Screen::Waiting {
                downloading: false,
                error: None,
            },
            "downloading" => Screen::Waiting {
                downloading: true,
                error: Some("YouTube content could not be prepared.".into()),
            },
            "wifi" => Screen::WifiSetup,
            _ => Screen::Starting,
        };
        let form = WifiForm {
            ssid: "Showroom Guest".into(),
            password: "hunter22".into(),
            focus: wifi_form::Field::Password,
            ..Default::default()
        };
        let wifi = WifiStatus {
            supported: true,
            ..Default::default()
        };
        println!(
            "{}",
            screens::render(&screen, &form, Some(&wifi), None).unwrap_or_default()
        );
        return;
    }

    let config = Config::from_env();
    let client = match agent::Client::new(&config.agent_url) {
        Ok(client) => client,
        Err(error) => {
            eprintln!("showroom-player: {error}");
            std::process::exit(EXIT_UNAVAILABLE);
        }
    };

    system::install_signal_handlers();
    if !agent_supports_native_player(&client) {
        // An agent release older than the native player has no
        // /local/player/state; let the launcher run the legacy kiosk.
        eprintln!("showroom-player: the agent has no native player endpoint; deferring to the legacy kiosk");
        std::process::exit(EXIT_UNAVAILABLE);
    }
    system::activate_own_vt();

    let mpv = match start_mpv(&config) {
        Ok(mpv) => mpv,
        Err(error) => {
            eprintln!("showroom-player: cannot start libmpv: {error}");
            std::process::exit(EXIT_UNAVAILABLE);
        }
    };
    if !wait_for_video_output(&mpv, Duration::from_secs(10)) {
        eprintln!("showroom-player: mpv did not open the DRM display");
        drop(mpv);
        std::process::exit(EXIT_UNAVAILABLE);
    }

    let terminal = input::RawTerminal::enable();
    let (key_sender, keys) = mpsc::channel();
    if terminal.is_some() {
        input::spawn_reader(key_sender);
    }
    let (message_sender, messages) = mpsc::channel();
    let (jobs, job_receiver) = mpsc::sync_channel(16);
    spawn_agent_poller(client.clone(), config.poll_interval, message_sender.clone());
    spawn_job_worker(client, job_receiver, message_sender);

    let mut player = Player::new(mpv, config, jobs);
    player.run(messages, keys);
    let shutdown_requested = system::QUIT.load(Ordering::SeqCst);
    drop(player);
    drop(terminal);
    // Leaving for any reason other than a stop request is a failure, so
    // systemd restarts the kiosk.
    std::process::exit(if shutdown_requested { 0 } else { 1 });
}
