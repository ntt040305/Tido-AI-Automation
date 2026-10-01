# Design System Specification — TIDO Video & Creative Factory

> **Source of Truth**: Extracted directly from `tido-ai-video-factory-claude-code-pack` source code, `@theme` token definitions in `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `FRONTEND_DESIGN_BRIEF.md`, and core component primitives in `apps/web/components/` & `apps/web/features/`.
> **Portability**: Tailored for Google Stitch MCP, AI Coding Agents (Antigravity, Claude Code, Cursor), and frontend engineering consistency.

---

## 1. Visual Theme & Atmosphere

### Studio Obsidian Aesthetic
TIDO is an industrial, precision-engineered creative production tool. Its visual language evokes a high-end broadcast control room or a darkened video grading suite: deep obsidian backgrounds, cool charcoal surfaces, tactile studio paper typography, and glowing hardware indicators.

- **Zero Gradients**: Every surface, card, and background is strictly flat. Gradients and glassmorphism (frosted blurs, rainbow borders) are deliberately forbidden to maintain focused, editorial seriousness.
- **Dark Mode Only**: Built exclusively around a `#0B0B0C` foundation. No light mode exists.
- **Hardware Telemetry Signature ("Đèn Tally")**: A prominent broadcast heritage design feature — 6px circular tally indicators provide instant, glanceable state feedback (recording, live rendering, passed QC, warning).
- **AI Intelligence Signature ("AI Glow")**: A dedicated warm gold accent (`#E3B341`) reserved strictly for autonomous machine intelligence, separating creative reasoning from user actions and alerts.
- **Information Hierarchy & Restraint**: "1 Project = 1 Screen". Screens adapt dynamically to the project's production stage (`DRAFT` → `AWAITING_CREATIVE_APPROVAL` → `IN_PRODUCTION` → `COMPLETED`) rather than scattering workflows across multiple wizard pages.

---

## 2. Color Palette & Roles

Colors are organized strictly by functional role rather than arbitrary palette naming.

### 2.1 Canvas & Surfaces (Obsidian Layering)
| Token | Hex | Role & Application |
| :--- | :--- | :--- |
| `bg` | `#0B0B0C` | Root page background, master canvas |
| `surface` | `#151517` | Standard card containers, panels, input fields, dropdown menus |
| `surface2` | `#1C1C1F` | Elevated cards, hover states, active sidebar tiles |
| `surface3` | `#232326` | Inactive toggle segments, subtle nested wells, stage track rules |

### 2.2 Structural Boundaries & Outlines
| Token | Hex | Role & Application |
| :--- | :--- | :--- |
| `border` | `#28282C` | Default structural border on cards, inputs, and section dividers |
| `borderStrong` | `#38383D` | Interactive borders, ghost button outlines, table header dividers |

### 2.3 Studio Paper Typography (Warm Neutrals)
| Token | Hex | Role & Application |
| :--- | :--- | :--- |
| `text` | `#F2F1ED` | High-contrast primary text, primary button fill, headings |
| `text2` | `#9C9B96` | Secondary body text, form field labels, descriptions |
| `text3` | `#65645F` | Muted metadata, timecodes, breadcrumbs, placeholder text |

### 2.4 State Signals & Tally System (Broadcast Hardware Indicators)
| Token | Hex | Role & Application |
| :--- | :--- | :--- |
| `accent` | `#E6402F` | Tally Live / Rendering pulse, active sidebar tab indicator, scene role tag |
| `accentDim` | `#5A2019` | Accent pill fill, text selection background (`::selection`) |
| `ok` | `#5FBF77` | Success status, completed stage dot, passing QC score |
| `okDim` | `#1E3323` | Success pill background, passed badge fill |
| `warn` | `#E8A33D` | Cautionary status, retry indicator, quota alert |
| `warnDim` | `#3A2C10` | Warning badge fill |

### 2.5 Machine Intelligence ("AI Glow")
| Token | Hex | Role & Application |
| :--- | :--- | :--- |
| `aiGlow` | `#E3B341` | Warm studio gold — Creative Director insights, opportunity tags, AI decisions |
| `aiGlowDim` | `#2E2413` | Deep amber fill for AI strategy badges, AI card borders (`aiGlow/30`) |

---

## 3. Typography & Text Hierarchy

TIDO pairs a clean, humanistic Vietnamese-optimized sans-serif with a technical monospace font.

### 3.1 Font Families
- **Primary Interface Font**: `Be Vietnam Pro`, `sans-serif` (Google Fonts).
  - Weights: `400` (Regular), `500` (Medium), `600` (SemiBold), `700` (Bold).
  - Configured via CSS variable: `--font-sans`.
  - Characteristics: Exceptional legibility with complex Vietnamese diacritic tone marks, modern geometric proportions without feeling sterile.
- **Technical & Telemetry Font**: `IBM Plex Mono`, `monospace` (Google Fonts).
  - Weights: `400` (Regular), `500` (Medium), `600` (SemiBold).
  - Configured via CSS variable: `--font-mono`.
  - Characteristics: Engineered legibility for timecodes (`00:03.24`), job identifiers (`JB-0231`), currency figures (`$46.20`), scene roles (`CẢNH 01 — HERO HOOK`), aspect ratios (`9:16`), and system status.

### 3.2 Scale & Hierarchy Matrix
| Style / Role | Size | Weight | Tracking / Leading | Font | Text Color |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page Title (H1)** | 26px | 600 (SemiBold) | `-0.01em` | Sans | `text` (`#F2F1ED`) |
| **Section Title (H2)** | 18px–20px | 600 (SemiBold) | Normal | Sans | `text` (`#F2F1ED`) |
| **Card / Modal Title (H3)** | 14px–15px | 600 (SemiBold) | Normal | Sans | `text` (`#F2F1ED`) |
| **Body (Standard)** | 13.5px–14px | 400 (Regular) | `leading-[1.7]` | Sans | `text2` (`#9C9B96`) |
| **Form Label** | 12.5px–13px | 500 (Medium) | Normal | Sans | `text2` (`#9C9B96`) |
| **Caption / Help Text** | 11.5px–12px | 400 (Regular) | Normal | Sans | `text3` (`#65645F`) |
| **Scene / Role Tag** | 11px | 600 (SemiBold) | `+0.08em` (UPPERCASE) | Mono | `accent` (`#E6402F`) |
| **Telemetry / KPI Value** | 20px | 500 (Medium) | Normal | Mono | `text` (`#F2F1ED`) |
| **Status Badge Text** | 11px | 500 (Medium) | Normal | Mono | Contextual (`ok` / `warn`) |

---

## 4. Spacing, Radii & Elevation

### 4.1 Border Radius Tokens
| Token | Value | Applied To |
| :--- | :--- | :--- |
| `--radius-DEFAULT` | `14px` | Form inputs, textareas, standard cards, control blocks |
| `--radius-lg` | `20px` | Video players, hero media frames, project thumbnails |
| `--radius-pill` | `999px` | Buttons, filter chips, duration badges, avatar containers, tally chips |

### 4.2 Elevation & Shadows
- **Card Shadow (`--shadow-card`)**:
  ```css
  box-shadow: 0 1px 2px rgba(0,0,0,0.35), 0 10px 28px rgba(0,0,0,0.28);
  ```
- **Tally Glow**:
  ```css
  box-shadow: 0 0 6px var(--color-accent);
  ```
- **AI Glow Subtle Elevation**:
  ```css
  box-shadow: 0 0 12px rgba(227, 179, 65, 0.15);
  ```

### 4.3 Layout Grid & Sizing Principles
- **Sidebar**: Fixed 64px width (`w-[64px]`), full height (`h-screen`), sticky.
- **Main Workspace Canvas**: Flexible with strict responsive max-width (`max-w-[1180px]` or `max-w-[1440px]`).
- **Project Stage Split Layout**: `grid grid-cols-[1fr_300px] gap-11`.
  - Left column: Dynamic workspace adapting to current stage (`DRAFT` → `AWAITING_CREATIVE_APPROVAL` → `IN_PRODUCTION` → `COMPLETED`).
  - Right column: Persistent 300px `AssetPanel` containing brand logo, colors, product photos, references, and style notes.
- **Media Aspect Ratios**: Strictly enforced to respect production deliverable formats:
  - Vertical Video: `aspect-[9/16]`
  - Landscape TVC: `aspect-[16/9]`
  - Product Reference / Avatar: `aspect-square`
  - *Never crop video thumbnails into generic squares.*

---

## 5. Component Patterns & Visual Tokens

### 5.1 Primary Action Button
- **Structure**: Rounded-pill, high contrast, inverted coloring.
- **Classes**: `bg-text text-bg hover:opacity-90 rounded-pill font-semibold font-sans py-[11px] px-[22px] text-[14px] transition-all active:scale-[0.97] cursor-pointer inline-flex items-center justify-center gap-2 border border-transparent`
- **Behavior**: Solid white/cream on dark canvas. Distinct, commanding, impossible to miss.

### 5.2 Ghost / Secondary Button
- **Structure**: Low-key obsidian button with subtle border.
- **Classes**: `bg-surface text-text2 border border-borderStrong hover:text-text hover:border-text2 rounded-pill font-semibold font-sans py-[11px] px-[22px] text-[14px] transition-all active:scale-[0.97] cursor-pointer inline-flex items-center justify-center gap-2`

### 5.3 Filter Chip / Toggle Pill
- **Structure**: Pill-shaped selector used in gallery filters and mode switches.
- **Active State**: `bg-text text-bg border-text rounded-pill py-[7px] px-[15px] text-[12.5px] font-medium`
- **Inactive State**: `bg-transparent text-text2 border-borderStrong hover:text-text hover:border-text2 rounded-pill py-[7px] px-[15px] text-[12.5px]`

### 5.4 The Tally Dot Indicator (`TallyDot`)
A 6px circular hardware light indicating lifecycle status:
- **Live / In-Production**: `w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--color-accent)] animate-pulse`
- **Completed / Passed QC**: `w-1.5 h-1.5 rounded-full bg-ok`
- **Draft / Inactive**: `w-1.5 h-1.5 rounded-full bg-text3`
- **Warning / Review Required**: `w-1.5 h-1.5 rounded-full bg-warn`

### 5.5 Form Controls (Inputs & Textareas)
- **Structure**: Surface-recessed dark fields without garish focus rings.
- **Classes**: `w-full bg-surface border border-border rounded-DEFAULT py-2.5 px-3 text-[14px] text-text outline-none focus:border-text2 transition-colors placeholder:text-text3`
- **Focus Rule**: Never use colorful outer glow rings. Focus smoothly transitions border from `border` (`#28282C`) to `text2` (`#9C9B96`).

### 5.6 Project Stage Indicator (`StageMini`)
- Visual breadcrumb at the top of `/projects/[id]`:
  - 5px circular dots connected by 16px horizontal rules (`h-[1px] bg-border`).
  - Completed stages: `bg-ok border-ok`.
  - Current stage: `bg-accent border-accent`.
  - Future stages: `bg-surface3 border-borderStrong`.
  - Accompanied by a monospace status label (e.g. `Đang sản xuất`).

### 5.7 Scene Script Block (`SceneBlock`)
- Vertical script unit comprising:
  - Header: `font-mono text-[11px] text-accent tracking-[0.08em] uppercase` (e.g. `CẢNH 01 — HOOK BẮT TREND`).
  - Narration & Visual description: `text-[13.5px] text-text2 leading-[1.7]`.
  - Mini thumbnail (during production stage): 9:16 aspect ratio box with status tally and frame counter.
  - Studio sliders (emotion, tempo, vocal tail tags) styled in compact `bg-surface/50 border-border/70 text-[11.5px] rounded-md` buttons.

### 5.8 AI Creative Brain Panel
- Dedicated surface for autonomous intelligence:
  - Header badge: `w-8 h-8 rounded-lg bg-aiGlow/15 border border-aiGlow/30 text-aiGlow` with pulsing Brain icon.
  - Title: Monospace kicker `AI CREATIVE BRAIN` in `text-aiGlow`, header `text-[14.5px] font-bold text-text`.
  - Strategy cards: Bordered with `border-aiGlow/20` and grounded by `ProductTruth` facts.

---

## 6. Interaction & Motion Guidelines

- **Micro-Hover Elevation**: Cards with clickable targets subtly shift upwards on hover:
  ```css
  transition: transform 150ms ease;
  &:hover {
    transform: translateY(-3px);
  }
  ```
- **Active Tactile Feedback**: All clickable buttons provide immediate press feedback:
  ```css
  &:active {
    transform: scale(0.97);
  }
  ```
- **Animation Constraint**: Animations are restricted to functional telemetry:
  - `animate-pulse` (2s ease-in-out infinite) strictly for active rendering / live recording.
  - No bouncing modals, rotating icons, or decorative parallax.

---

## 7. Stitch Agent Prompting Cheatsheet

When prompting Stitch or coding agents to generate or extend TIDO UI screens, use this compact directive:

```text
Design Context: TIDO AI Video Factory
Theme: Obsidian dark studio theme (bg: #0B0B0C, surface: #151517, surface2: #1C1C1F).
Colors: Flat colors only. Zero gradients. Zero glassmorphism.
Text: Be Vietnam Pro for interface text (#F2F1ED, #9C9B96, #65645F); IBM Plex Mono for telemetry, IDs, tags, timecodes.
Accents: Red tally (#E6402F) for active/live status; Gold (#E3B341) for AI intelligence; Green (#5FBF77) for success.
Radii: 14px for inputs/cards, 20px for large players/thumbnails, 999px for buttons and chips.
Buttons: Primary is solid #F2F1ED text on #0B0B0C, rounded-pill. Ghost is #151517 with #38383D border.
Thumbnails: Strictly 9:16 or 16:9 aspect ratio. Never square-crop video frames.
```
