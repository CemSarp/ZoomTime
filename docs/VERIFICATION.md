# Verification evidence

## 0.3.3 guest import patch —2026-10-16

Controlled Tailscale status text reproduced exactly SyntaxError/Unexpected token T/The Tailsc before the fix. The connection loop is now tested directly: guest fallback for unavailable/non-JSON/null/array status, strict redacted host error, unchanged stopped→up→Running auto-connect for both roles. Full suite68pass, typecheck/lint/diff pass. Real local CLI paths both return valid JSON/Running; no live up/Serve or policy changes were made. This does not establish the guest’s exact warning or Tailscale variant.

Packaged arm64 checks pass28 groups at320×180 and160×90. The first run failed only because the live GitHub API returned its rate-limit message; the test now explicitly accepts only that known actionable error (alongside a current/newer version result), records its state and does not claim successful discovery. The unchanged production updater retains all certificate/URL/checksum checks. The rerun passes the existing device/window/security/Keychain/authentication/cleanup checks. Both arm64/x64 builds pass deep/strict signatures, architecture/version/macOS-floor/privacy metadata, security fuses, six-file ASAR payload, equality with final compiled bundles and ZIP integrity. Intel execution is untested. Evidence:out/verification/artifacts-0.3.3.json, packaged-smoke-0.3.3.json and packaged-smoke-minimum-0.3.3.json; hashes/source/lock/build metadata are under out/distribution/0.3.3. No calling/media code changed, so the long generated-WebRTC suite is not repeated; packaged security/device/window checks still apply. Actual guest Mac pairing/WSS, two-network/no-TURN media, Intel execution and long-call gates remain pending.0.3.3 is local and unpublished;0.3.2 release remains unchanged.

## v0.3.2 publication recheck — 2026-10-15

User explicitly authorized pushing and publishing. All65 unit tests pass after the user closed the host occupying47831; the initial60pass/5port-conflict run was an environment collision, not a final passing run. Typecheck/lint/diff check pass. A fresh packaged rerun passes28 groups at each mini size, including Settings discovery after publication and existing security/device/window checks. Both unchanged packages again pass signature/architecture/metadata/fuse/minimal-payload/source-equality/ZIP and SHA-256 checks. Five uploaded asset sizes/digests match local files; the original clean build manifest and exact binary-source annotated tag9f57abe are retained. Public release and both ZIP links return HTTP200. Anonymous API discovery now selects0.3.2 on arm64/x64 for an older updater-enabled version and refuses equal-version downgrade. GitHub propagation briefly returned the older release list immediately after publishing; normal refresh then showed the new release. No runtime code or security settings changed.

Published prerelease: https://github.com/CemSarp/ZoomTime/releases/tag/v0.3.2 . Uploaded binaries are the locally verified candidate described below, with the same pending physical evidence. Versioned release notes:docs/releases/v0.3.2.md. Raw GitHub metadata/checksum staging is ignored under out/release/0.3.2.

## 0.3.2 update candidate — 2026-10-15

- `npm test`: **65 pass**, no failures/skips. Eleven update tests cover numeric version/no downgrade, architecture, drafts/prereleases, exact URLs and digests, malformed/oversized metadata, rate limits, HTTPS redirect boundaries, retries/serialization, truncated/excess/corrupt bytes, quarantine/readback and changed-file rejection before Finder.
- `npm run typecheck`, `npm run lint`, `git diff --check`: pass. Production audit0; dependency pins unchanged.
- Live GitHub API: onlyv0.2.0, so this local0.3.2 correctly reports no newer published build. Existing release metadata/download validated with normal TLS and no token.
- Real download fixture: existing arm64v0.2.0 ZIP,127113436bytes,5.646s, SHA-256 matches GitHub, quarantine retained0281. Isolated under ignored out/verification/update-download; never installed or substituted for the current app. Evidence:out/verification/update-download.json.
- Full media suite was not repeated: media/calling source is unchanged. The prior0.3.1 real-WebRTC/generated-media evidence remains historical; packaged regression checks still exercise generated device checks, permission revocation, native full-screen/mini, secure IPC/CSP, Keychain/auth/reset.

- Final `npm run test:packaged`: **28 groups pass at both mini sizes**; the normal-size run checks the actual Settings button against GitHub and shows the installed0.3.2/no-newer status. Startup stays idle and unverified downloads cannot be revealed. Existing generated-device checks, permission cleanup, native full-screen→mini/Dock, secure origin/Node/CSP/navigation/IPC, authenticated host/Keychain and reset still pass. Settings screenshot inspected; update controls/status are visible. No physical camera/mic was acquired.
- Both `npm run make:arm64` and `npm run make:x64` pass. Deep/strict signatures, architecture, version/bundle ID/macOS floor, privacy descriptions, security fuses, minimal six-file ASAR payload, equality to final compiled bundles and ZIP integrity all pass. Intel was built, not executed. Versioned evidence:out/verification/packaged-smoke-0.3.2.json, packaged-smoke-minimum-0.3.2.json, artifacts-0.3.2.json. The local reproducible check is out/verification/verify-artifacts-0.3.2.mjs.
- Full fresh npm audit still reports8 development advisories (6high/2moderate); production audit0. No dependency changes or security bypasses. Distribution hashes/manifest/portable INSTALL are under out/distribution/0.3.2.

No new GitHub release or tailnet configuration change. Pending: downloaded app replacement/approval and profile preservation on the partner Mac, Intel execution, real cross-network/no-TURN media and long movie session. Local API/download checks cannot establish those outcomes.



## 0.3.1 local candidate — 2026-10-15

- `npm test`: **54 pass**, no failures/skips. Separate device-check permission, no call authorization through that lease, idempotent revoke, call takeover/rejection and two-minute expiration are covered.
- `npm run typecheck`, `npm run lint`, `git diff --check`: pass.
- `node scripts/media-test.mjs --check-only`: pass using real Chromium/generated video and audio, no hardware. Preview/meter work; gain is initially0, positive only after explicit listening, and0 after Off. A deliberately delayed enable cannot override a newer Off. Stop/cancel/late results, device denial and retry release tracks. The initial disconnected-output meter test failed and led to the zero-gain output fix; the delayed-enable test failed before the request guard fix.
- `npm run test:media`: pass,133.306s total, includes those device-check cases and all existing real WebRTC/calling/quality/recovery/cleanup checks. This is not a long continuous call or acoustic listening evidence.
- `npm run test:packaged`: **26 groups pass at both mini sizes**, minimum run also uses640×420 normal geometry. Actual packaged Settings starts/stops generated camera/mic, meter responds, monitoring toggles, Stop/Done/mini release all tracks, and the check cannot authorize an unpaired call. Permission revokes after cleanup. Computed button colors/surfaces and paired-action geometry pass. Existing isolation/CSP/IPC/auth/Keychain/native-window tests pass. The test launch uses generated devices and muted speaker output only; no insecure permission flags or hardware capture.
- `npm run make:arm64`, `npm run make:x64`, `npm run checksums`, SHA verification: pass. Both artifacts pass deep/strict signatures, architecture/version/OS floor, check-purpose usage descriptions, security fuses, six-file bundled payload and ZIP integrity. Intel execution is untested. Dependencies are unchanged.

Versioned evidence: out/verification/media-integration-0.3.1.json, packaged-smoke-0.3.1.json, packaged-smoke-minimum-0.3.1.json, artifacts-0.3.1.json. Screenshots device-check-active.png use generated imagery; paired.png/paired-compact.png show the real button styles. Hashes/build provenance/INSTALL are in out/distribution/0.3.1. No publication or live Tailscale change.

Pending: physical camera, acoustic microphone/headphone routing and feedback/latency, Intel execution, downloaded update, actual two-Mac/no-TURN and long-call acceptance. Existing0.3.0/0.2.0 evidence below is historical.

## 0.3.0 local candidate — 2026-10-15

Same local hardware/toolchain as below. New source is local; no GitHub publication or live tailnet mutation during these tests. No dependency additions/upgrades. Existing0.2.0 release remains unchanged.

| Command/check | Fresh result |
| --- | --- |
| npm test | **52 pass**, no failures/skips; includes preferences migration, normalization, Serve conflict/Funnel/foreground protection and concurrent config change, native transition ordering. |
| npm run typecheck / npm run lint / git diff --check | Pass. |
| npm run test:media | Pass,133.067s total using real WebRTC with generated media. Live720p/1080p/360p applyConstraints updates keep the peer/tracks; camera constraint rejection preserves the prior choice for reacquisition. Existing media/lifecycle/cleanup checks also pass. Lost-request30.031s; stale recovery30.009s; ring60.193s. No hardware capture. |
| npm run make:arm64 / npm run make:x64 | Pass. New0.3.0 ZIPs; previous-version ZIPs retained. |
| npm run test:packaged | **24 groups pass at both mini sizes** on the latest arm64 bundle. Assertions include actual native full-screen→mini, full-screen→Dock with native minimized state, retained normal geometry; corner-drag saves preview size, local-only mirror, show/hide preview, checkbox/slider Settings, modal closure when shrinking, light/dark rendering, plus existing security/Keychain/auth/cleanup checks. |
| Both artifact checks | codesign deep/strict, executable architecture, stable bundle ID/version/minimum OS/usage descriptions, security fuses, minimal six-file ASAR payload and unzip integrity pass. x64 was not executed. |
| npm audit --omit=dev | Zero production npm advisories. |
| Full npm audit | Eight existing development advisories: six high, two moderate. No runtime dependency changes. Exposure/limits are described below. |

Evidence copies: out/verification/media-integration-0.3.0.json, packaged-smoke-0.3.0.json, packaged-smoke-minimum-0.3.0.json and artifacts-0.3.0.json. Screenshots normal-light.png, normal-dark.png, settings.png, mini-self.png and mini-self-minimum.png show the real packaged UI; preview media in screenshots is explicitly synthetic. These images do not prove composited visibility over a movie. Version-specific hashes and source/lock/build provenance are in out/distribution/0.3.0.

Still pending: live automatic Host/Join with Tailscale (the command runner is controlled in tests to avoid changing real services), first-install/login/VPN/HTTPS approval, actual two-Mac/no-TURN connectivity, hardware1080p/CPU/bandwidth/thermal performance, partner full-screen overlay, downloaded installation/update and a three-hour call. No local generated-media result replaces these gates.

## Historical 0.2.0 evidence

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
