---
name: ruktimer-ux-review
description: Plan and verify RukTimer UX refinements with task flows, Vietnamese copy, responsive checks, and timing regression tests.
---

# RukTimer UX review

## Skill pack

| Skill or workflow | Use | Input | Output and quality check |
|---|---|---|---|
| RukTimer task walkthrough (this skill) | Research, strategy, IA | PRODUCT.md and current task | Record the user's job, steps, observed friction and a measurable success condition. Mark hypotheses as hypotheses. |
| Impeccable shape | Flow and wireframe | Task walkthrough and screenshot | Sketch the screen and states in reading order. Every control serves the task or a recovery path. |
| UI UX Pro Max | Responsive and interaction decisions | Narrow question about input, hierarchy or accessibility | Look up the applicable criterion and test it at the affected viewport. |
| Design System | Token selection | Existing Tailwind tokens and DESIGN.md | Use common color, type and geometry rules. Only document implemented or explicitly planned conventions. |
| Impeccable polish and audit | Implementation and review | Rendered UI and source | Review focus, contrast, state feedback, reflow and motion. Fix reproducible task blockers. |
| RukTimer interaction checks (this skill) | Regression and iteration | Browser, build and representative data | Complete a real solve and save it. Record viewport, input type, observed result and remaining gaps. |

Design, Brand, Banner Design and Slides are useful for identity and marketing work. This refinement uses RukTimer's existing identity. UI Styling can guide component work when the task adds a new shared control. For visual decisions, the upstream Anthropic Frontend Design guide favors typography, structural hierarchy and motion tied to feedback.

## Operating sequence

1. Read PRODUCT.md and AGENTS.md. Confirm the target platform and main task.
2. Capture the incumbent UI at 320px, 390px and desktop. Measure overflow, target size and position of the main action.
3. Write the user job in this form: “When …, I want …, so I can …”. Use product evidence and observed behavior. Keep proposed research separate from findings.
4. Draw the reading order and map the main path and recovery states using real Vietnamese labels.
5. Record the decisions in DESIGN.md and apply its tokens in existing components.
6. Review default, hover, focus, active, loading, empty, error and success where applicable.
7. Complete the browser checklist and record pass, failure or unverified for each relevant item.
8. Rank remaining findings by impact. P0 prevents the primary task or loses data. P1 blocks an important input method or recovery. P2 adds avoidable friction.

## Review prompts

- **Walkthrough** — Where does a Guest pause or guess between getting a scramble and saving a solve?
- **Wireframe** — Which elements must be in the first viewport, and which can appear after a deliberate action?
- **Responsive review** — Does the same task work at 320px with Vietnamese labels and long session names?
- **Token review** — Does each new value convey an established role, including normal, selected, ready or error?
- **Accessibility review** — Can the user discover, focus and activate the action with a keyboard, and understand its state without relying on color?
- **Regression review** — What observable result proves the timer started, stopped and saved correctly?

## Browser checklist

- Start as a Guest. Choose a puzzle and a session, generate a scramble and complete a timed solve.
- Hold and release Space, activate a focused control with Space, and try touch hold and cancel on narrow screens.
- Check visible focus, tab order, current navigation state and access to session actions.
- Try a long session name, a long scramble, a three-decimal time, empty history and a delayed scramble.
- Check the primary clock fits above navigation when idle on a 390 × 844 viewport. Verify the page reflows at 320px.
- Run npm test and npm run build. Use a production build for browser verification.
- Record which checks used emulation. Leave device, screen reader and cloud behaviors unverified unless exercised directly.

## Usability follow-up

Ask a new user and an experienced speedcuber to complete a Guest solve and find its history without hints. Record completion, time to first solve and wrong taps. Compare against the incumbent build before making broader navigation changes.
