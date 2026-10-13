# ZoomTime Window Probe Implementation Plan

> For agentic workers: use superpowers:executing-plans inline. Track checkable tasks below. The user has already approved and requested implementation of the complete project plan; do not request design approval again.

**Goal:** Deliver phases 0–1: documented project and packaged, testable floating-window probe.

**Architecture:** One Electron BrowserWindow and sandboxed renderer; a narrow preload handles mode/restore/close and state events. Shared pure logic validates IPC and clamps/persists window bounds. Synthetic motion proves renderer continuity; physical two-Mac full-screen tests gate phase 2.

**Tech Stack:** Node 24, Electron 44.7.1, Forge 8 TypeScript/Webpack template, plain HTML/CSS, Node test runner.

**Spec:** `docs/ARCHITECTURE.md` and the user-approved project plan.

## Global constraints

- macOS 14+, normal 900×600, mini 320×180, minimum 160×90 logical pixels; one renderer.
- Sandbox/isolation, no Node integration, narrow validated IPC, bundled UI and CSP; deny permissions in phase 1.
- No calling, signaling, Tailscale configuration, camera, mic, or recording until phase 1 gate passes.
- Do not delete unrelated files, publish, change system security, or claim missing physical evidence.

## Review focus

- Off-screen/malformed saved geometry must recover safely on an available display.
- Renderer-origin or iframe IPC must not control the window.
- Keyboard/hover controls must remain usable at 160×90 and not reset synthetic continuity.
- Packaged CSP/preload behavior must be tested, not inferred from development mode.
- Intel packaging and both-Mac full-screen behavior must be labeled unverified until actual execution.

## Task 1: Contract and scaffold

Files: AGENTS.md, architecture/guide, README, HANDOFF, Forge/Webpack/TypeScript configs and package metadata.

- [x] Inspect empty workspace, instructions, toolchain, and live maintained tooling.
- [x] Record agreed scope, reasons, limits, future phases, and gate requirements.
- [x] Initialize scoped Git repository on codex/window-probe; no existing main branch/worktree needs protection.
- [x] Configure Mac-only Forge packaging, strict TypeScript and pinned dependency versions.

## Task 2: Window safety and persistence

Files: src/window-state.ts, src/security.ts, src/settings.ts, tests/window-state.test.ts, tests/security.test.ts, tests/settings.test.ts.

Interfaces: Bounds {x,y,width,height}; WindowMode normal|mini; WindowState {mode,bounds,preferencesError}; ZoomTimeBridge getState(), setMode(mode), restore(), close(), onState(callback). Synthetic session UUID belongs to the renderer itself, so a reload is detectable.

- [x] RED: malformed values, oversized/offscreen/negative-display rectangles, unavailable monitors, saved normal/mini independence.
- [x] RED: exact trusted main-frame URL and valid modes; reject subframes, external and lookalike URLs, arbitrary values.
- [x] Implement minimum logic and atomic settings persistence; report recoverable save/read errors without logging private paths.
- [x] GREEN: full test suite and strict typecheck.

## Task 3: Persistent window and accessible synthetic view

Files: src/main.ts, src/preload.ts, src/renderer.ts, src/index.html, src/index.css.

- [x] Wire one BrowserWindow, validated IPC and subscription, secure origin and deny navigation/new windows/permissions.
- [x] Switch native bounds/workspaces/topmost/buttons without reload; implement display recovery and focus only on explicit restore/activation.
- [x] Implement labeled synthetic motion, persistent frame/time/session diagnostics, accessible native/menu/keyboard mode and close controls.
- [x] Verify real packaged Electron continuity, min sizes, no Node exposure, forbidden requests and CSP. Permission queries denied; direct capture-denial execution remains unverified.

## Task 4: Package and evidence

Files: scripts/smoke.mjs, scripts/checksums.mjs, scripts/fullscreen-fixture.mjs, docs/MANUAL_TESTS.md, HANDOFF.md.

- [x] Package arm64 and x64, verify bundle metadata/signatures, generate checksums and source/dependency build manifest. Rebuild from committed final source for delivery.
- [x] Run tests, typecheck, lint, production dependency audit and packaged smoke.
- [x] Final staged diff inspection and `git diff --check` before the initial source commit.
- [x] Test local UI/full-screen fixture as available; record observations with exact scope, never infer partner-Mac success. Composited visibility remains unverified.
- [x] Whole-change review and focused repairs; keep all evidence in handoff.
- [x] Stop before phase 2 until actual full-screen playback passes on both Macs. Supply ready-to-send probe archives and exact manual steps.
- [ ] Physical full-screen visibility gate on both actual Macs, using the actual movie workflows.
