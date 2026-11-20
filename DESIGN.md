---
name: RukTimer
description: Vietnamese-first practice timer and Rubik's Cube training workspace.
colors:
  canvas: "#101214"
  surface: "#181b1e"
  dialog: "#202428"
  foreground: "#f8fafc"
  secondary-text: "#cbd5e1"
  accent: "#67e8f9"
  holding: "#fcd34d"
  ready: "#86efac"
  error: "#fda4af"
typography:
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
  timing:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontWeight: 700
    lineHeight: 1
spacing:
  compact: "8px"
  gutter: "12px"
  section: "16px"
  touch-target: "44px"
rounded:
  control: "8px"
  panel: "16px"
---

## Overview

RukTimer serves speedcubers and learners using keyboard or touch. Its primary job is to get a Guest from scramble to a saved solve without a sign-in step. Keep the information that matters while practicing within easy reach. Verify improvements with task completion, time to first solve and the number of wrong taps.

## Colors

Use flat canvas, panel and dialog surfaces from the shared theme. Keep color differences between themes subtle so the clock and scramble remain prominent. Cyan marks actionable controls and the selected destination. Amber signals a hold or inspection. Green signals readiness. Rose marks errors and destructive actions. Include text or a recognizable control state alongside color.

## Typography

Web and PWA use locally bundled Geist and Geist Mono. Expo uses system sans and platform monospace with the same palette. Use tabular digits for timing, splits and scramble notation. Keep minutes and hours legible at narrow widths.

## Layout

**Mobile wireframe** — Brand and account controls → puzzle and session selectors → scramble and its controls → timer and state instruction → solve actions → secondary practice modes. The fixed bottom bar links Timer, CFOP, AI and Video, History, and Statistics. At desktop widths, retain the top mode switch and side panels for Statistics and History.

**Guest solve** — Choose puzzle and session → read or regenerate scramble → hold → ready → release → solve → stop → review result or open History. A canceled press returns to waiting. A generating scramble has a loading label. A new session starts with empty history and can be named during creation. Confirm destructive session actions.

## Elevation & Depth

Use borders to separate controls and task areas. Keep the timer area flat. Reserve shadows for an overlay that needs separation from underlying controls.

## Shapes

Use the Tailwind 8–16px corner scale for controls and panels. Primary touch controls should have a 44px target and visible keyboard focus.

## Components

- **Header** — Brand, account and settings lead on mobile. The puzzle and session are adjacent. Session actions rise from the session control.
- **Scramble** — The move sequence is the strongest line. Keep new scramble near the training selector. Put previous, copy, edit and Cross help together.
- **Timer** — Mode changes sit below the timing surface. A concise live status communicates hold, ready, inspection, running and saved-time states without announcing every clock tick.
- **Video Analyzer** — “Phân tích clip” opens a new recording and starts the on-device scan in one step. Opening a video file also starts its first scan. Keep retry, manual marks, device download and explicit cloud upload distinct.
- **Navigation** — Desktop uses a segmented row and mobile uses an icon with a short label. Underline the current destination and keep keyboard focus distinct. The mobile History count sits beside the icon, including at zero. Use 11px for the compact mobile labels and count, and expose the exact count in the accessible name.
- **Video intake** — Use a filled file action and an outlined camera action. Stack them at narrow widths. Explain that selecting a clip starts analysis automatically. Keep the clip and timeline available after opening a file.
- **Practice progress** — Place the date range and period filter above a single grid of metrics. Compare with the preceding period of the same length. Use one cyan series for daily solve counts and provide the same values in a disclosure table and weekly calendar. Keep the empty state explicit and label achievements as lifetime.
- **Footer** — Group documentation and feedback as two equal-width links on mobile. Reserve room below the links for the navigation bar and device safe area. Keep the footer out of the focus order during a solve.
- **Đấu 1v1** — Show the player seats side by side and put spectator and referee controls below them. Once play starts, prioritise score and status, then the Scramble and timer. Put the two times and confirmation together. Keep confirmed round details available in match history.

## Do's and Don'ts

Use the product's Vietnamese terminology and Lucide icons for controls with a clear action. Keep feedback local to the relevant control. Respect reduced motion and native browser zoom. Keep photos and decorative animation out of the timing workflow.
