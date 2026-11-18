# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Speedcubers and Rubik's Cube learners in Vietnam (from 2-Look CFOP beginners to competitive WCA cubers) practicing across desktop (Spacebar / external Stackmat manual entry) and mobile devices (touch hold, installable PWA, and companion React Native Expo app in `mobile/`).

## Product Purpose

RukTimer provides a WCA-standard Rubik's Cube timer, session manager, CFOP algorithm learning/drill studio, and cloud-synced solve history so cubers can measure solves accurately, master CFOP cases, and track long-term progress (PB, Mo3, Ao5, Ao12, Ao50, Ao100, TPS) from any device.

## Positioning

Combines a full WCA multi-puzzle timer (13 official events with 2D scramble net simulation) and an interactive 69-algorithm CFOP Trainer where every algorithm maintains its own dedicated cloud-synced timer session, setup scramble, and TPS tracking—accessible immediately in Guest Mode without forced signup.

## Operating Context

- **Primary workflows**:
  1. **Timer Mode**: Generate WCA scramble → optional 15s inspection (8s/12s audio alerts, +2/DNF auto-penalties) → hold Spacebar or touch screen to arm → release to start → any key or tap to stop → post-solve penalty (+2/DNF), comment, or delete.
  2. **CFOP Trainer Mode**: Browse/filter 69 CFOP cases (Cross/Triggers, F2L, OLL, full 21/21 PLL, 2-Look beginner path) with top-down/front-right visual diagrams → open dedicated per-algorithm Drill Studio → practice with setup moves, blind memory toggle, and live TPS calculation.
  3. **Cloud Sync & Backup**: Immediate Guest Mode (`localStorage`) with one-click merge into Supabase Cloud PostgreSQL upon Email/Password or Google OAuth sign-in, plus JSON/CSV export and import.
- **Physical environments**: Desktop keyboard (`Space`, `Alt+N/2/D/Z`, `Esc`), mobile portrait/landscape touch screens (with Wake Lock and haptic feedback), and offline PWA usage.

## Capabilities and Constraints

- **Language & Terminology**: Vietnamese primary UI copy while preserving standard international cubing terminology (`Single`, `Mo3`, `Ao5`, `Ao12`, `Ao50`, `Ao100`, `PB`, `DNF`, `+2`, `CFOP`, `F2L`, `OLL`, `PLL`, `Scramble`, `TPS`, `WCA Inspection`).
- **Must-preserve behaviors**:
  - Guest Mode must work immediately with zero login wall, and guest solves must remain syncable to Supabase Cloud after authentication.
  - WCA timing accuracy (`performance.now()` / `requestAnimationFrame`), configurable hold delay (`0ms`, `300ms`, `550ms`), 2 or 3 decimal places, and focus mode hiding sidebars while solving.
  - Cloud persistence via Supabase (`cube_sessions` and `solves` tables with RLS) shared between the Next.js web app (`https://ruk-timer.vercel.app`) and the companion Expo app (`mobile/`).

## Brand Commitments

- **Product name**: `RukTimer` (brand mark `Ruk` + `Timer` with 2x2 cube emblem).
- **Live URL**: `https://ruk-timer.vercel.app` (deployed on Vercel, `sin1` region).

## Evidence on Hand

- Production Next.js 15 web app & PWA (`src/components/RukTimerApp.tsx`, `src/components/TimerDisplay.tsx`, `src/components/CfopTrainerView.tsx`, `src/app/manifest.ts`, `public/sw.js`).
- Verified 69-algorithm CFOP library (`src/lib/cfop.ts`) and 3D-to-2D cube net simulator (`src/lib/scrambles.ts`).
- Supabase Cloud PostgreSQL schema (`supabase/schema.sql`) and companion React Native Expo app (`mobile/App.tsx`).

## Product Principles

1. **Zero-Friction Timing**: Never block a solve behind login walls, modals, or clutter; Spacebar and touch interactions must respond with minimal latency.
2. **Focus During Execution**: Minimize visual distractions once the timer arms or runs so the cuber's attention stays on lookahead and execution.
3. **Practice With Purpose**: Pair every CFOP formula with clear visual recognition, exact setup moves, and its own isolated session history and TPS feedback.
4. **Seamless Continuity**: Preserve local Guest progress and sync cleanly to the cloud across desktop, mobile PWA, and native Expo app.
