# ZoomTime handoff

Updated 2026-10-14. Version 0.2.0 is an implemented calling **release candidate**. Physical release acceptance remains pending. This supersedes the earlier probe-only status; preserve the 0.1.0 archives as historical window-probe builds.

## Final build and OS approval

The exact 0.2.0 archives were rebuilt from clean application source6a7bdc40109403a2ce64b2301c361c0f3b32491d. Both pass signature/architecture/metadata/payload/fuse/ZIP and SHA-256 checks. The final packaged smoke passes all20 groups at both sizes, including actual safeStorage encrypt/decrypt and reset.

New ad-hoc signatures caused Keychain access to exceed the original test deadline. The computer-use tool explicitly blocked SecurityAgent for safety, so no agent UI workaround was attempted. The user completed the local approval and replied done. The unchanged checks then passed with an in-memory five-minute storage deadline; a subsequent ordinary npm run test:packaged also passed both sizes with its normal30-second storage deadline. No encryption, permission or source bypass was added. Expect local Keychain approval after future changed builds. Later documentation commits do not change the archive's application-source revision6a7bdc4. Final manifests and a standalone recipient INSTALL.md are under out/distribution/0.2.0.

## Decision and evidence status

The user reported normal/mini and full-screen playback passing on their Mac only, then explicitly requested continued implementation and agent-run tests. AGENTS.md and the 2026-10-14 plan record proceeding with software work while retaining partner-Mac, actual two-network and long-session tests as release blockers. An actual no-TURN connection failure still stops release. Do not ask again for permission to do already authorized local work or invent remote evidence.

No Tailscale installation was available here. No login, tailnet/Serve/grants, router/security settings or external publication was performed. No partner Mac is accessible. Network setup is documented in docs/NETWORK_SETUP.md, not claimed as executed.

## Implemented

- One persistent sandboxed BrowserWindow/renderer/video view. Independent normal/mini bounds, 320×180 default and 160×90 minimum, floating/full-screen workspace APIs, display clamping, hover/focus controls, native restore shortcuts and single-instance handoff.
- Plain TypeScript/HTML/CSS calling interface with explicit pairing, Call/Accept/Reject/Cancel, mute/camera, audio-only fallback, default-device recovery, hangup, and redacted diagnostics.
- Main-owned encrypted safeStorage pairing; separate random 32-byte role credentials, explicit clipboard invitation, strict canonical WSS endpoint, atomic private ciphertext files, no plaintext fallback. Reset revokes after successful save; a failed save stops host/capture and reports incomplete disk revocation.
- Loopback-only authenticated WebSocket coordinator on 127.0.0.1:47831; guest WSS through private Tailscale Serve 8443 /zoomtime. Text JSON only, 64 KiB, compression off, 100 application messages/10 seconds/role across reconnects, one active connection per role, heartbeat20s/two missed replies.
- Real WebRTC with iceServers: [], host-only offers, call IDs/generations, queued early ICE, explicit capture, late-result guards, camera-track release, mute-preserving replacement and idempotent cleanup. Ring60s, connect30s, request acknowledgement30s, media debounce5s, one restart/outage and recovery30s. No healthy-call duration deadline.
- Sleep/wake/crash/close/quit interrupt the session; wake never silently reacquires devices. No recording, screen capture, analytics, automatic update, FaceTime, STUN/TURN or hosted provider.
- Electron44.7.1 / Forge8.0.1 / TypeScript6.0.3 with exact lockfile. ws8.22.0 is the only runtime npm dependency. Optional ws native accelerators are ignored with its supported JS/Node fallback.

Read docs/ARCHITECTURE.md for every decision's reason and source boundaries. Main/preload own secrets/permissions; renderer owns media. Do not turn these ordinary modules into a generic backend/plugin framework.

## Verification

Local Mac17,8 / M5 Pro, arm64, macOS26.6.2; Node24.21.0/npm11.19.0/Xcode27.0. `npm test`:43 pass. Typecheck/lint pass. Real local WebRTC suite:pass in132.3s, including actual positive/negative getUserMedia permission flow using generated test devices, bidirectional generated media, early/stale ICE, identity continuity across resize/socket recovery/ICE restart, mute/camera/devices, late cancellation, explicit audio-only/mic failure, lost-request30s cleanup, second call, frozen-video detection/one restart/30s recovery cleanup, and real60s ringing cleanup.

Actual arm64 packaged checks pass20 groups at each mini size, including Node/CSP/navigation/IPC/capture denial, duplicate instance, persistent renderer/video, hover/keyboard/geometry, actual safeStorage encrypt/decrypt and authenticated host/reset. Native endpoint Paste failed before the Edit-role repair and succeeded afterward; Mini/Escape also repeated. Capture hardware was not used. Full detail, evidence paths, advisories and limits: docs/VERIFICATION.md. Read-only requested review: docs/REVIEW.md, no outstanding findings.

Reproduced problems repaired: one-way answerer media, acknowledgement signaling feedback, muted audio replacement, startup/reset listener race, retry/reset failure capture authorization, cancelled-call revival, lost initial request device leak, proxy503 misclassified as pairing failure, and native endpoint paste.

## Packages and reproduction

Build sequentially: npm run make:arm64; npm run test:packaged; npm run make:x64; npm run checksums. The version0.2.0 ZIPs are under out/make/zip/darwin/{arm64,x64}; exact SHA-256/source/lock/toolchain/commands are in out/distribution/0.2.0. Keep out and personal profiles/secrets ignored. Use the manifest's source revision to reproduce. x64 compilation/signature checks do not mean Intel execution was tested.

Private ad-hoc signing uses JIT/camera/audio-input entitlements, with no hardened runtime because its Team-ID/library validation rejected the ad-hoc Electron framework in an observed probe test. Sandboxing/isolation, TLS, Gatekeeper and ASAR integrity remain enforced. No paid certificate/notarization or automatic update. Expect possible per-app trust and Keychain/permission prompts on downloaded builds/updates; never disable protections globally.

## Remaining work requires actual external evidence

Follow docs/ACCEPTANCE.md on both actual Macs after the private network is configured. Required: guest downloaded clean install/update; both-network hardware audio/video and observed ICE route; actual movie full-screen/Spaces/display behavior; ≥60-minute then three-hour session with measured memory/CPU/bandwidth/thermal behavior; routing/device changes, sleep/wake/outages/host departure and second-call/device-LED cleanup. Do not replace these with clock advancement or generated media. If the actual networks fail, preserve evidence and require an explicit architecture revision before adding any relay/service.

Runtime npm audit:0 advisories. Full audit:8 unresolved development advisories (6high/2moderate), documented with actual exposure; do not blindly downgrade Forge to0.0.2. Keep Electron/Chromium updated and rerun connection, permissions, package and full-screen checks after changes.

Historical baseline: c851098 contained the 0.1.0 window probe;15 tests and both package sizes passed. It had no calling. That is historical evidence only; current candidate behavior/results above supersede those counts/status.
