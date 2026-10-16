> Historical 0.1.0 synthetic window-probe procedure. For the calling candidate use [current acceptance](ACCEPTANCE.md), [verification](VERIFICATION.md), and [network setup](NETWORK_SETUP.md). The user reported their own-Mac full-screen test passing on 2026-10-14; partner evidence remains pending.

# Phase 1 physical acceptance

Do this on **each actual Mac**, with the matching privately shared packaged build. The full-screen gate is currently **pending**. Do not advance to signaling merely because unit/packaged smoke tests passed.

## Record per Mac

- Date and tester:
- Mac model and processor:
- macOS version:
- Archive filename and SHA-256:
- Actual browser/player and version:
- Display(s) and scaling:
- Accessibility/reduced-motion settings relevant to the test:

## Checks

1. Open the app. It says **Synthetic window test**, with no camera/mic permission request. Record the session ID.
2. Observe moving circles (or only advancing counters with Reduce Motion). Click Open mini mode. Counters must continue, with the same session after restore.
3. Open another ordinary app; mini remains visible. Type/use controls in that other app; ZoomTime must not repeatedly steal focus.
4. Resize mini down to 160×90 logical pixels and drag it to different corners. Hover and Tab expose usable restore/close buttons. Move by its background; clicking a button should not drag the window.
5. Enter **native full-screen movie playback**, not just maximize a browser. Observe the mini view and increasing counter for at least five minutes. Test your actual browser/service/player. Record each tested app separately.
6. Switch between Desktop Spaces and the full-screen player. Check both overlay visibility and continued drawing. Record any disappearance, pause, or unwanted app/Space switch.
7. Restore with the arrow and with Escape while ZoomTime is focused. Check normal size/position and unchanged session/counter. Repeat normal/mini five times.
8. Quit/reopen: separate normal/mini geometry should restore when the corresponding mode is selected. The new launch gets a new session and counter; it must not start capture.
9. If used, test an external display and remove it while mini is there. The view must return to an available screen. Test changed scaling; do not substitute a mock for this step.
10. Dock-minimize deliberately: it hides the window. Restore through the Dock/Window menu; **Mini** is the intended persistent view, not Dock minimization.
11. Close/quit: the process exits. A second launch while already running should restore the existing instance instead of opening another renderer.

Mark each step **pass / fail / not tested** and describe failures precisely. No need to share movie content or personal desktop screenshots; counters, observed behavior, and environment details suffice.

## Evidence so far

2026-10-13, local macOS 26.6.2 arm64: packaged normal→mini→Escape restoration observed through native accessibility/UI. The earlier main-owned session label was insufficient to detect reloads and has been replaced with a renderer-owned UUID. Automated packaged checks now verify that UUID across every transition, advancing frames, both native mini dimensions, fitting controls, hover, trusted Tab/Shift-Tab, Enter and Escape. This establishes local packaged behavior only.

Local Chrome 155.0.8059.40 entered native full-screen playback of `scripts/fullscreen-fixture.mjs`'s synthetic canvas-video. The probe frame counter advanced from 106 to 1,911 during the UI experiment. App-specific screenshots cannot verify composited overlay visibility, so this experiment does not pass the full-screen gate. Safari was also attempted without conclusive overlay evidence. No actual movie service, QuickTime, partner Mac, display removal, Intel execution, network call, or long movie session has been verified.

Automated evidence is stored under `out/verification/packaged-smoke.json` and `packaged-smoke-minimum.json`, with screenshots in the same folder. Its checks are deliberately separate from the physical gate. Camera/microphone permission queries are denied; an actual acquisition-denial experiment was inconclusive and is not recorded as passed.

## Gate result

- Your actual movie workflow: pending.
- Girlfriend's actual movie workflow: pending.
- Overall phase 1: pending physical acceptance; phase 2 not started.

## Current native-capture validation — 2026-10-17

This section is separate from the historical window-probe procedure above. The user authorized local capture implementation and test outputs. On this macOS26.6.2 arm64 Mac: real ScreenCaptureKit display/two-window capture, Metal composition, hardware encoding, saved-file decode, movement/resizing, actual window closure, invalid selection recovery and display→window switching passed. Packaged Settings Refresh/Start/close stopped and drained the worker. See SCREEN_CAPTURE.md for exact evidence and scope.

Still pending: deny Screen Recording in the OS, verify no stream starts, explicitly re-enable/relaunch/retry and validate pixels; switch between two physical displays then unplug the selected one; execute on macOS14 and Intel; test a controlled authorized protected playback source alongside an ordinary fixture and verify the session survives any unavailable tile. No protected-content capability is currently demonstrated. Blank pixels must not be called FairPlay detection. Never reset TCC, alter system security, or use private guessed signatures to pass a test. Existing second-Mac/network/no-TURN/long-call gates remain pending.

### Permission correction / Intel retirement follow-up

User reports permission enabled but repeated prompts and capture denied. Actual tccd evidence shows a saved signature mismatch for ZoomTime and denial; old Codex-launched success is not a normal-launch permission pass. Source now preflights, avoids repeating a failed request in one session and provides an explicit fixed Screen Recording settings action with current-copy/restart guidance.96 software tests and native typecheck pass. No new binary was built; verify the revised UI and reauthorization from Applications only after a separately authorized build. Intel is retired, so future physical acceptance targets Apple Silicon/macOS14+ only. Old Intel files/evidence remain historical.
