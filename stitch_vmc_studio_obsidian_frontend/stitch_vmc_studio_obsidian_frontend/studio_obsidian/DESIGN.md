---
name: Studio Obsidian
colors:
  surface: '#151517'
  surface-dim: '#131314'
  surface-bright: '#3a393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1c1b1c'
  surface-container: '#201f20'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353436'
  on-surface: '#e5e2e3'
  on-surface-variant: '#e4beb8'
  inverse-surface: '#e5e2e3'
  inverse-on-surface: '#313031'
  outline: '#ab8983'
  outline-variant: '#5b403c'
  surface-tint: '#ffb4a8'
  primary: '#ffb4a8'
  on-primary: '#690000'
  primary-container: '#ff5541'
  on-primary-container: '#5c0000'
  inverse-primary: '#b91e13'
  secondary: '#f1c04c'
  on-secondary: '#3f2e00'
  secondary-container: '#b58a17'
  on-secondary-container: '#372700'
  tertiary: '#71d2fd'
  on-tertiary: '#003547'
  tertiary-container: '#2f9bc4'
  on-tertiary-container: '#002e3e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad4'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#930001'
  secondary-fixed: '#ffdf9e'
  secondary-fixed-dim: '#f1c04c'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#5b4300'
  tertiary-fixed: '#bfe9ff'
  tertiary-fixed-dim: '#71d2fd'
  on-tertiary-fixed: '#001f2a'
  on-tertiary-fixed-variant: '#004d65'
  background: '#131314'
  on-background: '#e5e2e3'
  surface-variant: '#353436'
  surface2: '#1C1C1F'
  surface3: '#232326'
  border: '#28282C'
  border-strong: '#38383D'
  text: '#F2F1ED'
  text-muted: '#9C9B96'
  text-telemetry: '#65645F'
  tally-live: '#E6402F'
  tally-success: '#5FBF77'
  tally-warning: '#E8A33D'
  ai-gold: '#E3B341'
typography:
  headline-xl:
    fontFamily: Be Vietnam Pro
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  telemetry-lg:
    fontFamily: Space Mono
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.05em
  telemetry-md:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.02em
  telemetry-sm:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-caps:
    fontFamily: Space Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

# Design System Specification — TIDO / VMC Video & Creative Factory

> Studio Obsidian Aesthetic tailored for Vic Marketing (VMC).

## 1. Visual Theme & Atmosphere
- **Style**: Studio Obsidian Aesthetic — industrial precision, broadcast telemetry hardware look.
- **Palette Rules**: Zero gradients. Zero glassmorphism. Flat solid obsidian surfaces only. Dark mode exclusive (#0B0B0C).
- **Hardware Tally Indicators**: 6px circular LEDs (Active/Live Render pulse: #E6402F; Success: #5FBF77; Warning: #E8A33D; Muted: #65645F).
- **AI Intelligence Signature**: Studio gold (#E3B341) reserved exclusively for machine intelligence & prompt enhancements.

## 2. Color Palette & Roles
- `bg`: `#0B0B0C` (Master canvas)
- `surface`: `#151517` (Cards, panels, inputs, dropdowns)
- `surface2`: `#1C1C1F` (Elevated cards, active states)
- `surface3`: `#232326` (Muted wells, rule dividers)
- `border`: `#28282C` (Default borders)
- `borderStrong`: `#38383D` (Interactive borders, ghost buttons)
- `text`: `#F2F1ED` (High contrast text, buttons)
- `text2`: `#9C9B96` (Secondary labels, body text)
- `text3`: `#65645F` (Muted telemetry, timecodes, breadcrumbs)
- `accent`: `#E6402F` (Tally Live / Active red)
- `ok`: `#5FBF77` (Success / Passed QC)
- `warn`: `#E8A33D` (Caution / Retrying)
- `aiGlow`: `#E3B341` (Creative Director / AI Insights)

## 3. Typography
- **UI Font**: `Be Vietnam Pro`, sans-serif (Weights 400, 500, 600, 700)
- **Technical & Telemetry**: `IBM Plex Mono`, monospace (Timecodes, project IDs like `PRJ-8821`, tags, aspect ratios `9:16`, `16:9`, seeds, telemetry)

## 4. Radii & Dimensions
- Inputs / Cards: 14px (`rounded-[14px]`)
- Media Viewers / Large Frames: 20px (`rounded-[20px]`)
- Action Buttons / Tally Badges / Chips: 999px (`rounded-full`)
- Media Aspect: Strictly `9:16` or `16:9`, never square cropped.

## 5. Navigation & Brand
- Sidebar: Fixed 64px-72px, obsidian dark, VMC logo brand header (`VMC` / `VIC MARKETING`).
