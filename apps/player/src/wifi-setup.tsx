import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type WiFiNetwork = {
  ssid: string;
  signal: number;
  security?: string;
  secure: boolean;
  inUse?: boolean;
};

export type WiFiHotspot = {
  ssid: string;
  password: string;
  url: string;
  joinQr?: string[];
};

export type WiFiStatus = {
  supported: boolean;
  connected: boolean;
  interface?: string;
  ssid?: string;
  error?: string;
  networks?: WiFiNetwork[];
  hotspot?: WiFiHotspot;
  connecting?: boolean;
  lastAttempt?: { ssid: string; ok: boolean; message?: string };
};

type Submission = { status: "idle" | "saving" | "error" | "success"; message?: string };

async function configureWiFi(ssid: string, password: string) {
  const response = await fetch("/local/wifi/configure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ssid, password }),
  });
  if (!response.ok) throw new Error((await response.text()).trim() || "Unable to connect to Wi-Fi");
  return (await response.json()) as WiFiStatus;
}

async function rescanNetworks() {
  const response = await fetch("/local/wifi/networks?rescan=1", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to scan for Wi-Fi");
  return ((await response.json()) as { networks: WiFiNetwork[] }).networks;
}

function QrCode({ rows, label }: { rows: string[]; label: string }) {
  const quiet = 3;
  const size = rows.length + quiet * 2;
  const path = rows
    .flatMap((row, y) =>
      [...row].map((cell, x) => (cell === "1" ? `M${x + quiet} ${y + quiet}h1v1h-1z` : "")),
    )
    .join("");
  return (
    <svg aria-label={label} className="wifiQr" role="img" shapeRendering="crispEdges" viewBox={`0 0 ${size} ${size}`}>
      <rect fill="#fff" height={size} width={size} />
      <path d={path} fill="#000" />
    </svg>
  );
}

function SignalBars({ signal }: { signal: number }) {
  const level = signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1;
  return (
    <span aria-label={`Signal ${signal}%`} className="signalBars">
      {[1, 2, 3, 4].map((bar) => (
        <i className={bar <= level ? "on" : undefined} key={bar} style={{ height: `${bar * 0.22 + 0.2}rem` }} />
      ))}
    </span>
  );
}

/** Moves focus between list rows with the arrow keys, for a keyboard and no mouse. */
function moveFocus(event: KeyboardEvent<HTMLUListElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button.networkRow")];
  const index = rows.findIndex((row) => row === document.activeElement);
  const next = rows[Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), rows.length - 1)];
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

export function WiFiSetup({
  wifiStatus,
  lastError,
  onSubmitted,
}: {
  wifiStatus: WiFiStatus | null;
  lastError?: string;
  onSubmitted: () => void;
}) {
  const [chosen, setChosen] = useState<WiFiNetwork | "other" | null>(null);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submission, setSubmission] = useState<Submission>({ status: "idle" });
  const [scanned, setScanned] = useState<WiFiNetwork[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);

  const networks = scanned ?? wifiStatus?.networks ?? [];
  const hotspot = wifiStatus?.hotspot?.joinQr?.length ? wifiStatus.hotspot : null;
  // Without a scan list (older agents, nothing in range) the typed form is the screen.
  const manual = chosen === "other" || networks.length === 0;
  const needsPassword = manual || (typeof chosen === "object" && chosen !== null && chosen.secure);

  useEffect(() => {
    // Start keyboard users on the first row, without stealing focus later.
    if (chosen !== null || listRef.current?.contains(document.activeElement)) return;
    listRef.current?.querySelector<HTMLButtonElement>("button.networkRow")?.focus();
  }, [chosen, networks.length]);

  useEffect(() => {
    // A fresh list from the agent replaces a manual rescan.
    setScanned(null);
  }, [wifiStatus?.networks]);

  const submit = async (name: string, secret: string) => {
    setSubmission({ status: "saving", message: `Connecting to ${name}…` });
    try {
      const next = await configureWiFi(name, secret);
      setSubmission({
        status: "success",
        message: next.connected
          ? `Connected to ${next.ssid ?? name}. Waiting for claim code…`
          : "Credentials saved. Waiting for the network…",
      });
      setPassword("");
      setChosen(null);
      window.setTimeout(onSubmitted, 1_500);
    } catch (error) {
      setSubmission({
        status: "error",
        message: error instanceof Error ? error.message : "Unable to connect to Wi-Fi",
      });
    }
  };

  const choose = (network: WiFiNetwork | "other") => {
    setPassword("");
    setShowPassword(false);
    setSubmission({ status: "idle" });
    if (network === "other") {
      setSsid("");
      setChosen("other");
      return;
    }
    if (!network.secure) {
      void submit(network.ssid, "");
      return;
    }
    setChosen(network);
  };

  const saving = submission.status === "saving";
  const attempt = wifiStatus?.lastAttempt;
  const status: { text: string; error: boolean } | null = submission.message
    ? { text: submission.message, error: submission.status === "error" }
    : wifiStatus?.connecting
      ? { text: "Connecting…", error: false }
      : attempt && !attempt.ok && attempt.message
        ? { text: attempt.message, error: true }
        : wifiStatus && !wifiStatus.supported
          ? { text: "Wireless setup unavailable. Connect Ethernet instead.", error: true }
          : (wifiStatus?.error ?? lastError)
            ? { text: (wifiStatus?.error ?? lastError) as string, error: true }
            : null;

  const renderForm = () => (
    <form
      className="wifiForm"
      onKeyDown={(event) => {
        if (event.key === "Escape" && networks.length > 0) {
          event.preventDefault();
          setChosen(null);
          setSubmission({ status: "idle" });
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const name = manual ? ssid.trim() : (chosen as WiFiNetwork).ssid;
        if (!name) {
          setSubmission({ status: "error", message: "Enter the Wi-Fi name." });
          return;
        }
        if ((needsPassword && !manual && password.length < 8) || (manual && password.length > 0 && password.length < 8)) {
          setSubmission({ status: "error", message: "Wi-Fi passwords are at least 8 characters." });
          return;
        }
        void submit(name, password);
      }}
    >
      {manual ? (
        <label className="wifiField">
          <span>Wi-Fi name</span>
          <input
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            autoFocus
            maxLength={32}
            onChange={(event) => setSsid(event.target.value)}
            placeholder="Network name"
            spellCheck={false}
            type="text"
            value={ssid}
          />
        </label>
      ) : (
        <p className="chosenNetwork">{(chosen as WiFiNetwork).ssid}</p>
      )}
      <label className="wifiField">
        <span>{manual ? "Password (leave empty for an open network)" : "Password"}</span>
        <input
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          autoFocus={!manual}
          maxLength={63}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Wi-Fi password"
          spellCheck={false}
          type={showPassword ? "text" : "password"}
          value={password}
        />
      </label>
      <label className="showPassword">
        <input checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} type="checkbox" />
        Show password
      </label>
      <button disabled={saving} type="submit">
        {saving ? "Connecting…" : "Connect screen"}
      </button>
      {networks.length > 0 ? (
        <button className="secondary" onClick={() => setChosen(null)} type="button">
          Back to the list
        </button>
      ) : null}
    </form>
  );

  const picker =
    chosen !== null || manual ? (
      renderForm()
    ) : (
      <>
        <ul className="networkList" onKeyDown={moveFocus} ref={listRef}>
          {networks.map((network) => (
            <li key={network.ssid}>
              <button className="networkRow" disabled={saving} onClick={() => choose(network)} type="button">
                <span className="networkName">{network.ssid}</span>
                <span className="networkMeta">
                  {network.inUse ? "Saved" : network.secure ? "Password" : "Open"}
                  <SignalBars signal={network.signal} />
                </span>
              </button>
            </li>
          ))}
          <li>
            <button className="networkRow" disabled={saving} onClick={() => choose("other")} type="button">
              <span className="networkName muted">Other network…</span>
            </button>
          </li>
        </ul>
        {hotspot ? null : (
          <button
            className="rescan"
            disabled={scanning}
            onClick={async () => {
              setScanning(true);
              try {
                setScanned(await rescanNetworks());
              } catch {
                // Keep the list we have.
              } finally {
                setScanning(false);
              }
            }}
            type="button"
          >
            {scanning ? "Scanning…" : "Scan again"}
          </button>
        )}
      </>
    );

  return (
    <main className="playerRoot">
      <section className="setupScreen">
        <div className={hotspot ? "setupCard setupWide" : "setupCard"}>
          <p className="label">First-time setup</p>
          <h1>Connect to Wi-Fi</h1>
          {hotspot ? null : (
            <p className="setupCopy">Choose this screen&apos;s network to receive its claim code.</p>
          )}
          <div className={hotspot ? "setupColumns" : undefined}>
            {hotspot ? (
              <div className="phoneSetup">
                <p className="label">Use your phone</p>
                <div className="phoneSteps">
                  <QrCode label={`Join ${hotspot.ssid}`} rows={hotspot.joinQr ?? []} />
                  <ol>
                    <li>Scan with your camera</li>
                    <li>Tap to join the Wi-Fi</li>
                    <li>Pick your Wi-Fi on the page</li>
                  </ol>
                </div>
                <p className="setupCopy">
                  No camera? Join <strong>{hotspot.ssid}</strong> with password <strong>{hotspot.password}</strong>,
                  then open {hotspot.url.replace(/^http:\/\//, "").replace(/\/$/, "")}.
                </p>
              </div>
            ) : null}
            <div>
              {hotspot ? <p className="label">Or use a keyboard</p> : null}
              {picker}
            </div>
          </div>
          {status ? (
            <p aria-live="polite" className={status.error ? "setupMessage error" : "setupMessage"}>
              {status.text}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
