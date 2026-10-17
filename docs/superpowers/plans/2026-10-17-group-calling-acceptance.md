# Group calling acceptance and evidence

Spec: ../specs/2026-10-17-group-calling-design.md. Implementation/ledger: ./2026-10-17-group-calling.md.

## Source-only verification

| Scenario | Required result | Evidence |
| --- | --- | --- |
| Full unit suite/typecheck/lint/diff | All pass, exact counts/commands recorded | PASS: npm test124/124, typecheck, lint, diff; see execution ledger |
| Production port occupied | Isolated test host uses port0 and leaves47831 untouched | PASS: calling-isolation.test.ts with sentinel/occupied listener |
| Legacy host/guest | Ciphertext backup, retained credentials, stable IDs after restart | PASS: pairing/group-pairing source tests; real Keychain migration pending |
| Trust boundaries | No secret renderer state, forged membership/pair rejected, strict bounded v2 | PASS: protocol, pairing, signaling, service and renderer-import graph tests |
|2→5 membership | Named targets, explicit accept, healthy pair continuity | PASS: coordinator tests through capacity, revocation/parser and concurrency; real local browser suite PASS; real Macs pending |
| Leave/recovery | Only affected peers removed; host-media leave preserves group; bounded host loss | PASS: coordinator/service timer and membership tests; real routes pending |
| Shared capture | One stream; mute-safe replacements; late capture stopped | PASS:12 fake-RTC lifecycle tests including queue/timeout/cancellation races; generated media PASS; hardware pending |
| Grid/pin/speaker | Stable IDs/elements/order, one audio path, no visibility-triggered outage | PASS: keyed fake-DOM/speaker and received-frame tests; local pin/hidden-media progress PASS; physical layout/speaker check pending |
| Updater/checks | Inactive host cannot install/retry over another active group call | PASS: service state/guards; packaged main/installer exercise pending |
| Harness source |2/3/4/5 contexts, per-pair assertions and syntax/type checks | PASS source checks; browser/package execution PASS in subsequent authorized build |

## Authorized executable and physical gates

The user subsequently authorized the local experimental build and isolated checks. Fresh executable results follow; source/unit checks alone never count as physical evidence. Exact artifact, logs and rollback paths: HANDOFF.md and docs/VERIFICATION.md.

- [x] Real-local WebRTC suite passed153.127s (generated media, one Mac):2/3/4/5 contexts,10 bidirectional links at capacity, positive audio packets/video frames, one capture per context, stable existing connections, isolated ICE restart, complete cleanup, pin/hidden tile audio.
- [x] Authorized arm64 build and packaged smoke passed28 checks per size at320×180/160×90 and normal minimum; no stale binaries.
- [ ] Actual2/3/4/5 Apple Silicon Macs on intended networks; all guest-to-guest paths and coarse selected routes recorded.
- [ ] Hardware audio/video, mute/camera/default-device recovery and acoustics; local generated devices are not evidence.
- [ ] Host leaves media while other guests continue; host quit/sleep/loss triggers bounded cleanup; rejoin needs explicit invitation/action.
- [ ] Actual full-screen players, Spaces/display changes, compact controls, pin/grid, no focus stealing.
- [ ] Downloaded clean installation/update, safe pairing migration, Keychain/Gatekeeper/permission prompts and backup recovery.
- [ ]60-minute then3-hour five-person session, measured CPU/memory/bandwidth/thermals, no accumulated tracks/peers.

Record tester/date, revision/digest, Mac/OS, actual networks/player/devices, per-pair redacted route, duration/metrics/results. Keep names/addresses/credentials/raw SDP out of shared evidence. Signaling reachability does not prove mesh media reachability. An actual no-TURN failure blocks release; no silent fallback.

Actual group active-speaker visual accuracy, real hardware permissions and legacy safeStorage migration remain physical checks. The packaged smoke tests fresh pairing/retry with real safeStorage, not the user profile.
