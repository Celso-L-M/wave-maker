# Design Brief

## Direction

Neon Sunset Arcade — a 16-bit dusk over the Punta Rassa coastline, rendered as a dark, high-contrast arcade cabinet with a banded sunset sky and shimmering water.

## Tone

Maximalist retro-arcade: saturated sunset hues, chunky pixel bevels, and crisp nearest-neighbour scaling, executed with conviction rather than blended into a modern UI.

## Differentiation

The HUD is a pixel-art arcade cabinet overlay — beveled panels, mono arcade type, and a sunset gradient that mirrors the canvas sky — so the chrome feels like part of the game, not a webpage wrapped around it.

## Color Palette

| Token      | OKLCH          | Role                                    |
| ---------- | -------------- | --------------------------------------- |
| background | 0.17 0.055 285 | Dusk indigo sky base / page void        |
| foreground | 0.95 0.018 75  | Sand-cream text on dark surfaces        |
| card       | 0.22 0.062 288 | HUD panel and overlay surface           |
| primary    | 0.68 0.21 15   | Hot sunset coral — CTAs, active state   |
| accent     | 0.8 0.16 78    | Warm amber — score, highlights          |
| muted      | 0.27 0.05 288  | Recessed panel fills, disabled          |

Extended game tokens: sky bands `--sky-1..5`, `--sunset-high/mid/low`, `--sun-core`, `--sun-halo`, water `--water-deep/mid/shallow/glint`, `--foam`, silhouettes `--land-near/far`, `--palm`.

## Typography

- Display: Space Grotesk — title, headings, big score numbers
- Body: DM Sans — controls hint, labels, body copy
- Mono: JetBrains Mono — arcade HUD readouts (`pixel-text` utility)
- Scale: hero `text-5xl md:text-7xl font-bold tracking-tight`, h2 `text-3xl md:text-4xl font-bold`, label `text-xs font-semibold tracking-widest uppercase`, body `text-base`

## Elevation & Depth

Flat pixel-art depth: 3px hard borders plus inset bevel shadows (`pixel-panel`), no soft blur; layering comes from the parallax sky/water stack, not drop shadows.

## Structural Zones

| Zone          | Background              | Border          | Notes                                    |
| ------------- | ----------------------- | --------------- | ---------------------------------------- |
| Game canvas   | banded sky → water      | —               | Full-viewport, behind all overlays       |
| Cabinet frame | `cabinet-glow` inset    | `border-border` | Sunset bloom hugging the canvas edge     |
| HUD bar       | `bg-card` + bevel       | `border-border` | Top overlay: distance, high score, hint  |
| Overlay panel | `bg-popover` bevel      | `border-border` | Centered start / Wipeout modal           |
| Footer hint   | transparent             | —               | Floating control hint over water         |

## Spacing & Rhythm

Tight arcade density: HUD uses `gap-3` and `px-3 py-2` panels; overlays use `p-6 md:p-8` with `gap-4`; micro-spacing in 4px pixel multiples.

## Component Patterns

- Buttons: sharp 3px bevel, `bg-primary` coral, `text-primary-foreground`, hover brightens + 1px press offset
- Cards: `pixel-panel` bevel on `bg-card`, radius `rounded-md`, no blur
- Badges: `pixel-text` mono uppercase on `bg-muted`, amber text for score values

## Motion

- Entrance: overlay panels scale-in `150ms ease-out`; HUD fades in `200ms`
- Hover: buttons brighten and shift 1px down `120ms`
- Decorative: `float-slow` clouds drift, `pulse-soft` on the start prompt, `scanline` shimmer on the sun, `shimmer` on the water sun-reflection path

## Constraints

- Dark mode only — the sunset aesthetic defines the single theme
- Canvas rendering may use literal colors; DOM overlays must use semantic tokens only
- No sound, no persistent high scores (per doNotBuild)
- No day/night or weather variation; no animated water splash particles (per doNotBuild)
- Preserve all `index.html` social meta tags

## Signature Detail

A chunky pixel-art sun with horizontal scanline bands that bleeds warm amber through the cabinet frame — the arcade cabinet glow.
