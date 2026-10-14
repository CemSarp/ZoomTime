# Verification evidence — 0.2.0 calling candidate

Recorded 2026-10-14. Local host: Mac17,8 / Apple M5 Pro, arm64, macOS 26.6.2 (25G83); Xcode 27.0; Node 24.21.0; npm 11.19.0. Locked Electron 44.7.1 / Chromium 152.0.7977.149, Forge 8.0.1, TypeScript 6.0.3, ws 8.22.0. No partner Mac or Tailscale installation was available. No tailnet or system security settings were changed.

## Final-build Keychain reapproval

Both exact archives were rebuilt from clean application source6a7bdc40109403a2ce64b2301c361c0f3b32491d and pass the artifact checks below. After rebuilding, Keychain access exceeded the original test deadlines. The computer-use tool denied SecurityAgent access for safety; the user completed local approval and replied done. The unchanged packaged checks then passed all20 groups at both sizes with an in-memory five-minute storage deadline. A subsequent ordinary npm run test:packaged passed both sizes with its normal30-second storage deadline. No agent UI workaround, plaintext fallback or security bypass was used. Local approval may recur for changed ad-hoc builds; the earlier automatic test timeouts were real failures to complete, not successful checks.

## Automated software evidence

| Command | Observed result |
| --- | --- |
| `npm test` | 43 passing tests; zero failures/skips. Protocol, invitation validation, coordinator, real sockets/TLS, storage failure, authorization, revocation, settings and geometry. |
| `npm run typecheck` | Pass. |
| `npm run lint` | Pass. |
| `npm run test:media` | Pass in 132.3 seconds, two isolated real Chromium renderers with real WebRTC and authenticated WebSockets. Details below. |
| `npm run test:packaged` | 20 groups pass at both mini sizes, including final exact bundle after local Keychain approval; see the storage-deadline note above. |
| `npm audit --omit=dev --json` | Zero production npm advisories. This is not a security certification or a Chromium vulnerability assessment. |
| `npm audit --json` | Exits 1: eight development dependency advisories, six high and two moderate. Details below. |
| `npm run make:arm64` / `npm run make:x64` | Both pass; separate private ZIP archives produced. |
| Signature / metadata / payload / fuses / ZIP checks | Both architectures pass; details below. |
| `git diff --check` | Pass. |

Build artifacts and their exact source revision/hashes are recorded in `out/distribution/0.2.0/build-manifest.json` and `SHA256SUMS` after the final build. Build architectures sequentially with `npm run make:arm64` and `npm run make:x64`; then run `npm run checksums`. The x64 package is not evidence of execution on an Intel Mac. Release artifact signature, architecture, metadata, fuse and archive checks are separate from physical calling acceptance.

## Real local media test

`tests/media-main.cjs` runs the production protocol/coordinator/socket/client and browser MediaCall modules. The shipped app still owns only one window per Mac. The test fixture uses two windows to represent the two endpoints on one machine.

- Real `getUserMedia` is rejected before authorization and succeeds after it, using the production permission predicate and a bundled secure test origin. A **test-only generated-device switch** avoids acquiring hardware; it does not disable sandboxing, TLS or permission checks. It is never enabled in app code or ordinary launch.
- Calling tests use generated canvas video and WebAudio audio. Both sides decode received video and receive audio packets over actual WebRTC. Test playback is muted to avoid a tone on the speakers. No local camera/microphone or recording is involved.
- SDP is deliberately delayed so early ICE arrives first; obsolete generations are injected. Both peers retain identity and exactly two transceivers through resize, real socket reconnection and an actual host-led ICE restart.
- Camera off ends the generated track; on replaces the existing sender. Mute disables audio. Recovery disables a replacement microphone before it can reach the active sender.
- Outgoing and incoming capture promises deliberately finish after cancellation; late tracks stop. Explicit audio-only fallback, denied microphone, second calls, and all-track cleanup pass.
- A live track with deliberately frozen video is detected from received-frame statistics. The same outage uses one host ICE restart and releases both captures after **30.019 seconds** of bounded recovery; it does not loop forever.
- A deliberately dropped call request releases capture after **30.026 seconds**. An unanswered call uses a real clock and releases capture after **60.201 seconds**. Coordinator tests separately advance a healthy connected state beyond 40 minutes/12 hours to verify there is no application deadline; this is not a long real call.
- Selected candidates were host/host over UDP, reported as “Other direct candidate observed.” No STUN/TURN servers were configured. This local result says nothing about Tailscale media reachability on your actual networks.

Machine-readable evidence: `out/verification/media-integration.json`. Times vary slightly on rerun; the recorded JSON is authoritative for that run. Do not confuse the total 132.3-second failure-test suite with a continuous 132.3-second connected call.

## Packaged and native UI evidence

The actual arm64 bundle checks: secure bundled origin; absent Node globals; exact narrow bridge; invalid actions denied; CSP rejects eval/outbound fetch; new windows and arbitrary navigation blocked; actual camera/mic requests rejected before authorization; duplicate launch exits and preserves the first renderer; same partner video element and renderer across repeated modes; aspect-fit; native geometry; hover, Tab/Shift-Tab, Enter/Escape; real safeStorage encrypted persistence/decryption and authenticated loopback host/reset.

An initial five-second test deadline expired during Keychain access after rebuilding. Repeating with a 30-second deadline for storage operations passed. No Keychain permission/security changes or plaintext fallback were used. A future build may still require the user's Keychain interaction.

Native UI also reproduced an endpoint paste failure in the earlier candidate. Adding standard Edit/Paste roles made the same harmless endpoint paste succeed. Native Mini→Escape restore was repeated successfully. Test text was cleared and the app quit. No invitation was copied or shared.

Evidence: `out/verification/packaged-smoke.json`, `packaged-smoke-minimum.json`, `normal.png`, `mini.png`, `mini-minimum.png`. These are app-window screenshots, not proof of composited overlay visibility over a movie.

## Artifact checks

Both bundles pass `codesign --verify --deep --strict`, expected executable architecture (`file`), macOS14.0 minimum/versioned bundle identity and both camera/microphone usage descriptions (`plutil`). An assertion-based Node check reads the exact 11-entry ASAR payload: bundled main/renderer/preload, HTML/CSS and package metadata plus directories. The node_modules directory is empty; no dependency tree, tests, credentials, profiles, logs or development server is packaged. ws is bundled in main.

The same check uses @electron/fuses to assert RunAsNode, NODE_OPTIONS and CLI-inspect fuses disabled; cookie encryption, embedded ASAR integrity and ASAR-only loading enabled. Both distributable ZIPs pass `unzip -tq`. SHA-256 verification uses `shasum -a 256 -c out/distribution/0.2.0/SHA256SUMS`. Ad-hoc signature validity proves integrity, not Apple notarization or publisher identity.

## Reviewed regressions and repairs

Tests exposed and fixes covered: answerer-created transceivers causing one-way media; repeated connected acknowledgements causing a signaling loop; mute briefly lost on device replacement; startup/reset leaving a listener alive; storage/retry failure retaining capture authorization; cancelled-call resynchronization; lost request capture leakage; private proxy 5xx responses being misclassified as pairing failure. The final read-only review is recorded in REVIEW.md.

## Development dependency advisories

The full npm audit reports `braces` nested-pattern stack-exhaustion denial of service through `chokidar`, `micromatch`, `http-proxy-middleware`, `webpack-dev-server` and Forge's Webpack plugin. A `uuid` buffer-bounds advisory propagates through `sockjs`. These development packages are not shipped in the bundled runtime payload. No project API accepts user-provided glob/proxy patterns. The development server binds loopback, with hot reload/client disabled; do not browse untrusted sites while it runs. Exposure is narrower, but the advisories are unresolved.

npm's suggested Forge 0.0.2 downgrade is not a supported remedy. Keep maintained locked tooling, monitor upstream fixes, and recheck before development. Electron/Chromium updates still require attention independently of npm's production audit.

## Physical evidence and limits

User report: normal/mini/full-screen playback passed on the user's Mac only; actual player/version/duration unknown. Agent repeated native transitions and local software tests. It has not observed the partner Mac, a real two-network call, hardware capture/routing, actual full-screen movie composition, downloaded Gatekeeper approval/update, display removal, sleep/wake, or a 60-minute/three-hour real session. Tailscale setup commands remain documented and unexecuted.

See ACCEPTANCE.md for the release-blocking matrix. Do not mark final release accepted from these local tests.
