# Signal Room — UI Design System

## Aesthetic Direction

**"Precision Terminal / Mission Control Dark"**

The interface evokes a high-end broadcast control room or network operations center — the kind of environment where every pixel earns its place. It is purpose-built for AV/signage professionals who need fast situational awareness across a device fleet. The design rewards attention to detail: understated at rest, precise on interaction.

---

## Color System

All colors are defined as CSS custom properties on `:root`.

### Background Layers

| Token         | Value                      | Usage                        |
|---------------|----------------------------|------------------------------|
| `--bg`        | `#050b0e`                  | Page background              |
| `--bg-2`      | `#08121a`                  | Slightly elevated surface    |
| `--bg-3`      | `#0c1b26`                  | Card fill, preview bg        |
| `--bg-4`      | `#112230`                  | Deepest panel fill           |
| `--panel`     | `rgba(8,18,26,0.9)`        | Glassmorphic panel           |
| `--panel-strong` | `rgba(12,27,38,0.96)`   | High-contrast panel          |
| `--sidebar-bg` | `rgba(4,9,13,0.98)`       | Navigation sidebar           |

### Text

| Token       | Value       | Usage                     |
|-------------|-------------|---------------------------|
| `--text`    | `#cce6de`   | Primary text (warm white) |
| `--muted`   | `#4e7a74`   | Secondary / label text    |
| `--dim`     | `#2a4a45`   | Placeholder, tertiary     |

### Brand Accent — Electric Mint

The brand color is **electric mint** (`#00d9a0`). It appears on:
- Active navigation items
- The eyebrow label line
- Input focus rings
- Form status messages
- The landing page "screen" wordmark highlight
- Primary CTA button fill

This is a deliberate departure from conventional UI blue or purple. The mint-green hue references the monochrome green of terminal displays while feeling contemporary and ownable.

### Semantic Status Colors

| Status      | Color Token    | Value       | Usage                          |
|-------------|----------------|-------------|--------------------------------|
| Online      | `--signal`     | `#22d37a`   | Healthy device heartbeat       |
| Stale       | `--warning`    | `#f0a500`   | Device needs check             |
| Offline     | `--danger`     | `#f43f5e`   | No response 5+ min             |
| Unclaimed   | `--unclaimed`  | `#38bdf8`   | Awaiting assignment            |
| Queued      | `--queue`      | `#a78bfa`   | Pending commands               |

Each color has a paired `*-dim` token at ~10% opacity for background fills on pills and cards.

---

## Typography

**Body:** IBM Plex Sans — a humanist grotesque with strong technical character. Used at `14.5px` base with `1.6` line height.

**Monospace:** IBM Plex Mono — used exclusively for data that benefits from fixed-width rendering: large metric numbers, timestamps, command log entries, device identifiers, and heartbeat values.

### Scale

| Element               | Size / Treatment                         |
|-----------------------|------------------------------------------|
| Page header `h1`      | `clamp(1.6rem, 2.5vw, 2.2rem)`, `−0.04em` tracking, weight 600 |
| Landing hero `h1`     | `clamp(3.2rem, 8vw, 6.5rem)`, `−0.06em` tracking, uppercase    |
| Eyebrow label         | `0.7rem`, `+0.2em` tracking, uppercase, accent color            |
| Metric number         | `2.4rem`, IBM Plex Mono, `−0.06em` tracking, weight 600         |
| Metric hint           | `0.8rem`, muted color                   |
| Card label            | `0.92rem`, weight 600                   |
| Secondary/meta text   | `0.8rem`, muted color                   |
| Status pill           | `0.72rem`, `+0.1em` tracking, weight 600, uppercase             |

---

## Layout

### App Shell (`.chrome`)

Two-column grid: `260px` fixed sidebar + `1fr` workspace. On viewports ≤ 1100px, the sidebar collapses to a horizontal top bar.

### Sidebar (`.sideRail`)

- Sticky, full viewport height
- Background: near-opaque darkest surface (`--sidebar-bg`)
- Right border: `1px solid var(--line)`
- Brand block at top, nav in middle, org/user controls at bottom
- Responsive: horizontal top bar at ≤ 1100px

### Navigation Links (`.navLink`)

- Default: muted text, transparent border, no background
- Hover: text brightens, faint background, border appears
- Active (`.navLinkActive`): electric mint text, mint-tinted background, mint border — all at low opacity for subtlety
- Each item includes a 16×16 SVG icon with `opacity: 0.5` at rest, `0.8` on hover, `1.0` when active

### Workspace (`.workspace`)

- Padding: `2rem 2.5rem`
- Page-load fade-in animation (0.4s ease-out)
- Header (`workspaceHeader`) separated from content by a `1px` bottom border

### Metric Cards Grid (`.metricsGrid`)

5-column responsive grid. Each `MetricCard` receives a `tone` prop that maps to a CSS modifier class, producing:
- A 2px colored top accent strip
- A colored large number (using the status color)

Tones: `signal` · `warning` · `danger` · `unclaimed` · `queue`

### Screen Cards (`.screenCard`)

- 16:9 screenshot preview at top, no padding — edge-to-edge
- Card body (name, site, status, playlist, heartbeat) padded below
- Hover: 2px upward translate, mint border glow, screenshot zooms to 103%
- Pseudo-element overlay adds a subtle radial mint gradient on hover

---

## Components

### `StatusPill`

Three-part indicator: `[dot] [label]`

- The dot is a 5×5px circle filled with the status color
- For `online` status, the dot has a `pulse-dot` CSS animation (2s ease-in-out infinite scale + fade)
- Label is uppercase with tight tracking
- Background: status color at ~10% opacity

### `MetricCard`

Accepts `label`, `value`, `hint`, and `tone`. Renders a card with:
- Top accent bar (2px, colored by tone)
- Eyebrow label (accent color)
- Large monospace number (colored by tone)
- Small muted hint text

### `ClaimDeviceForm`

Rendered as a panel. Inputs use the base input style with accent focus ring. The submit button uses the base button style. Status messages use `IBM Plex Mono` in accent color.

### `CommandPanel`

2-column button grid. Each button is a ghost style — subtle border, low background opacity. The message state uses monospace accent text.

---

## Visual Effects

### Background Grid Texture

A fixed `::before` pseudo-element on `body` renders a 32px repeating grid using `repeating-linear-gradient`, at `1.3%` opacity. This creates a subtle measurement-grid feel without adding visual noise.

### Ambient Radial Gradients

Two radial gradients float on the body background:
- Top-left: electric mint at 7% opacity (brand warmth)
- Bottom-right: sky blue at 4% opacity (depth, coolness)

### Glassmorphism on Panels

All `.panel` elements use `backdrop-filter: blur(20px)` with a semi-transparent `--panel` background. This creates depth separation from the grid-textured background.

### Hover Interactions

All interactive cards animate with `cubic-bezier(0.16, 1, 0.3, 1)` — a fast ease-out spring that feels snappy rather than sluggish. Screen cards lift by 2px on hover and add a subtle border glow.

---

## Responsive Breakpoints

| Breakpoint   | Changes                                              |
|--------------|------------------------------------------------------|
| ≤ 1100px     | Sidebar becomes horizontal top bar; 2-col grids collapse to 1-col; metrics grid 3-col |
| ≤ 768px      | Metrics grid 2-col; button grid single column; reduced padding |

---

## Design Principles

1. **Color is signal.** Every non-neutral color communicates status. Decorative color is limited to the brand mint and ambient gradients.
2. **Monospace for data.** All numbers, identifiers, timestamps, and command strings use IBM Plex Mono. This creates an immediate visual grammar distinguishing data from UI.
3. **Stillness by default, motion on interaction.** The only continuous animation is the online status dot pulse. All other motion is triggered by user interaction (hover, focus, load).
4. **Layers, not borders.** Depth is created through background color differences and blur, not heavy borders or shadows. Borders are used sparingly and at very low opacity.
5. **Information density without clutter.** Cards contain exactly the data needed for fleet management decisions: identity, status, content, recency. Nothing decorative is added inside a card.
