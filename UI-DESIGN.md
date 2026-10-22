# Digital Curator UI

How the admin app (`apps/admin`) and the on-screen Pi pages (`apps/player`) look and behave.
The earlier "Signal Room" dark/mint spec is retired.

## Principles

- **Answer "is every screen OK?" first.** Overview leads with status counts and a Needs attention list; everything links to the screen that needs help.
- **Plain language.** "Delayed", "Player stopped", "Waiting for screen", not raw enums like `stale` or `take_screenshot`.
- **Show results, not just requests.** Every command shows its status (Waiting for screen, Running, Done, Failed) and failure message. Pages refresh themselves (`AutoRefresh`), faster while a command is pending.
- **Disruptive actions are deliberate.** Reboot, restart and display-off sit behind a menu and a confirm dialog. Removing a screen needs its name typed.

## Theme

- Tokens live in `apps/admin/src/app/globals.css`: light on `:root`, dark on `.dark` (set by `next-themes`, default follows the OS; toggle in the top bar).
- Tokens are global so portalled menus, selects, tooltips and dialogs match the page. Don't scope colors to a wrapper class.
- Status colors: `signal` (online/healthy), `warning` (delayed/at risk), `danger` (offline/broken), `unclaimed` (pairing), `queue`.
- The sidebar is dark in both themes; use Tailwind's `amber-*`/`emerald-*` there instead of `warning`/`signal`, which are tuned for the page background.

## Building blocks

- `lib/device-health.ts`: one source of truth for status labels, issues per screen, sort order and counts. Use it rather than re-deriving health in a page.
- `lib/commands.ts`: human command names and status labels.
- `StatusPill`, `CommandStatusBadge`, `ScreenThumbnail`, `PageHeader` (supports `back` and `meta`), `AutoRefresh`.
- `screen-controls.tsx`: `ScreenCommandProvider` shares one command sender per screen page; `ScreenActions`, `ScreenPreview`, `NetworkCard` read from it.
- shadcn/Base UI primitives in `components/ui`. When a `Button` renders a `Link`, pass `nativeButton={false}`.

## Pi screens (`apps/player`)

- Pairing shows the code in two groups of three (`ABC 123`), three numbered steps and the network status.
- Wi-Fi setup is keyboard-driven with a show/hide password button.
- These pages only read `/local/*` from the agent. Changes here must stay presentational: they ship to screens through the signed player release, and existing agents must keep working.
