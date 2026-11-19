---
name: RukTimer
description: Vietnamese-first practice timer and Rubik's Cube training workspace.
colors:
  canvas: "#020617"
  surface: "#0f172a"
  foreground: "#f8fafc"
  secondary-text: "#cbd5e1"
  accent: "#67e8f9"
  holding: "#fcd34d"
  ready: "#86efac"
  error: "#fda4af"
typography:
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
  timing:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
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

Apply the existing dark slate palette through Tailwind. Cyan marks actionable controls and the selected destination. Amber signals a hold or inspection. Green signals readiness. Rose marks errors and destructive actions. Include text or a recognizable control state alongside color.

## Typography

Use the existing sans stack for Vietnamese UI and monospaced tabular digits for timing, splits and scramble notation. Keep minutes and hours legible at narrow widths.

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
- **Bottom navigation** — Expose the current destination with an accessible state, color and a surface. Include the solve count where the user opens History.

## Do's and Don'ts

Use the product's Vietnamese terminology and Lucide icons for controls with a clear action. Keep feedback local to the relevant control. Respect reduced motion and native browser zoom. Keep photos and decorative animation out of the timing workflow.
