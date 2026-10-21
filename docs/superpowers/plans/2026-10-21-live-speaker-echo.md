# Live speaker echo controls —2026-10-21

User revision: enable/disable Reduce speaker echo during a call without leaving/rejoining; remove its Experimental label and put a short WebRTC explanation in a collapsed information section. The existing saved boolean remains opt-in. Preserve microphone mute, camera/video/peer identity, participant volumes, permission boundaries and the current call. No publication or new dependency.

## Design and runtime evidence

The bundled Chromium generated-microphone probe accepts `applyConstraints` but keeps echoCancellation=`all` after both boolean=true and ideal remote-only requests. A replacement microphone acquired with the advertised exact mode reports remote-only/all correctly. Consequently change only the outgoing microphone using existing capture authorization and audio senders; keep the camera, shared stream object, current call/pairs/generations and incoming playback untouched. A short microphone pause is possible. Off requests remote-only cancellation, retaining normal remote-call echo suppression. Unsupported sources keep optional ideal constraints and honest Unavailable status.

The audio-only request has a60-second bound; failure/timeouts preserve current media and stop late tracks. Optional sender replacement propagates errors without closing peers. Rejection rolls back original microphone/senders; ownership covers original and replacement through acquisition, commit, rollback and Leave. If rollback itself fails, keep the call open and offer Recover devices. Device checks swap their audio graph input while retaining preview, meter/listening and their original two-minute permission lease.

## Execution ledger

| Task | Result |
| --- | --- |
| Read repository instructions/current callers, confirm runtime constraint behavior. | Complete; live-echo-probe.log and live-echo-replacement-probe.log retain generated-device observations. |
| Add focused tests, then implement live audio-only swap and cleanup. | Complete. Original no-op setter fails focused tests; updated implementation passes. Sender rollback and rollback-cancel regressions each observed RED→GREEN. |
| Update saved preference flow, draft/geometry handling, collapsed information and status. | Complete. Changes apply before saving; failed operations restore preference. Unchanged geometry broadcasts do not undo in-flight choice. |
| Review permission ownership, denial, sender failure and cancellation. | Complete. Independent review found repeated device-check authorization and fatal optional sender failure; fixed both. Follow-up found rollback microphone ownership gap, reproduced and fixed with focused regression. Final review found no remaining blockers. |
| Run source/UI/real mesh/package checks and rebuild signed candidate. | Complete.151 tests/type/lint/diff and8 UI scenarios pass;153710-ms real mesh and28 packaged UI groups per Mini size pass. Signed candidate0.5.0-q0qjPH verifies and is installed/running at the authorized testing path with predecessor preserved. Exact artifacts/results in HANDOFF/VERIFICATION. |

Commands: `npm test`; `npm run typecheck`; `npm run lint`; `git diff --check`; `npm run test:ui`; `npm run test:media`; `npm run make:arm64`; `npm run test:packaged -- --ui-only`; `npm run make:update`. Preserve old artifacts/profiles and no-touch regular app policy; the prior explicit local installation authorization applies only to the named testing copy. Do not exercise hardware permissions or mutate pairing as proof of generated tests.

UI uses plain HTML details/summary with collapsed “How it works.” Description explains WebRTC speaker-reference cancellation, live switching/brief microphone pause, standard cancellation when off, macOS consent and variable acoustic results. Removing the Experimental label does not establish acoustic effectiveness. Physical speakers/movie/voice, installed permission continuity, independent Screen Recording issue, actual group networks and long sessions remain pending.

Specification reference: [W3C echo cancellation modes](https://w3c.github.io/mediacapture-main/#dom-echocancellationmodeenum-all). Runtime behavior is measured by the retained probe, not inferred solely from the standard.
