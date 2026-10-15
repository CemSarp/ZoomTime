# Iterative implementation guide

Every phase reads ARCHITECTURE.md, AGENTS.md, and HANDOFF.md. Preserve decisions and their reasons, locked dependencies, focused tests, and actual verification evidence. Report changes, commands/results, pending physical evidence, risks, and next prerequisites. The user explicitly authorized continued software implementation on 2026-10-14 after their own-Mac full-screen success. Physical gates now block release acceptance; unavailable evidence must stay pending. An observed cross-network failure still blocks this no-TURN version.

## 0 — Contract

Record the complete agreed constraints, reasons, rejected alternatives, trust boundaries, call lifecycle, direct-only limit, distribution tradeoffs, and reproducible commands. Do not configure live services. Contract complete; implementation status is in HANDOFF.md.

## 1 — Window probe

One sandboxed persistent renderer with labeled synthetic motion and frame counter. Normal/mini, 320×180 to 160×90, saved separate bounds, available-display recovery, floating across full-screen Spaces, accessible restore and keyboard controls, no repeated focus stealing. Test and package on arm64/x64. Actual full-screen playback on both Macs is the gate, not a mocked window flag.

## 2 — Private signaling

Loopback server and guest WSS via private Serve; secure pairing storage/import/export/reset; one authenticated connection per role; versioned bounded JSON; heartbeat and limits. Tests cover authentication, invalid/oversized messages, competing clients, revocation. Inspect existing tailnet configuration; never reset unrelated services or enable Funnel. Prove authenticated test messages across two networks; this does not prove media.

## 3 — Real calling probe

`iceServers: []`, explicit camera/mic permission flow, packaged usage descriptions, 720p/30 fps defaults with360p/24 and1080p/30 preferences (user revision2026-10-15), persistent partner video, muted self-preview, host-offerer, collision handling, queued early ICE, call/generation guards. Inspect actual selected route across two real networks. Run ≥60 minutes including mini/full screen. No STUN/TURN, SDP rewriting, or insecure flags to rescue failure.

**Release gate:** if media cannot connect on the actual networks, record evidence and stop release work. The 2026-10-14 ruling permits local implementation/testing while the remote evidence is unavailable.

## 4 — Usable call UI

Call/accept/reject/cancel/mute/camera/mini/hangup/status; hover and focus mini controls; camera releases hardware; default-device recovery and explicit audio-only continuation. No new renderer/peer/tracks merely for mode switch. Test a11y, aspect ratios, Retina, repeated switches.

## 5 — Recovery

Use exact timeouts/heartbeat in contract. One ICE restart after five-second debounce, bounded reconnect preserving working media, reject stale events, stop late tracks, idempotent cleanup on every terminal path. Handle devices, Tailscale, remote/host departure, crash, sleep/wake and monitors. Test real state, queueing, timers, cleanup; mocks do not prove WebRTC.

## 6 — Security/privacy review

Trace invitation, storage, authentication, messages, IPC, permissions, navigation, media and cleanup. Negative tests on invalid auth/input/IPC/URLs/permissions. Verify locked supported dependencies and relevant advisories; no certification claims or custom cryptography. Distinguish evidence from assumptions.

## 7 — Private packaged installation

Stable name/bundle identifier, arm64/x64 as needed, supported helper signing, no paid Apple membership/notarization. No secrets/logs/dev servers in packages. SHA-256, source revision, lockfile and exact build commands. Test downloaded clean install and update on her Mac without Node/Xcode. Document supported per-app approval, Keychain/permission prompts; never disable security globally.

## 8 — Movie session

Packaged real three-hour two-network call. Test both audio/video directions, native full screen, resize, mode switching, controls, permissions, device release, memory/CPU/bandwidth/thermals. Also Spaces, display removal, audio-device changes, outage, Tailscale, departure, sleep/wake, second call. Redacted in-app statistics; no raw SDP/credentials/addresses logged by default. Record hardware/OS/revision/route/duration/results; unavailable scenarios remain untested.

## Completion and maintenance

Done means actual two-Mac evidence, not compilation: authenticated usable calls, full-screen small view, three-hour session, controls/recovery/cleanup, no unwanted services/payments, reproducible builds and handoff. Update Electron periodically and rerun connection/window/permissions/package tests. Retain the working build while testing replacements. Never guarantee connectivity or unlimited availability merely because there is no app duration limit.

## 2026-10-15 scoped iteration

The user requested local-preview mirroring, optional resizable mini self-preview, quality controls, explicit in-app Tailscale Host setup, a full-screen/minimize fix and macOS visual refinement. These revise the partner-only mini and fixed360p defaults without changing the no-STUN/TURN architecture. Verify preferences migration/validation, Serve conflict preservation, actual native full-screen exit, preview/mirror/UI controls and live resolution changes. Actual two-device camera quality, CPU/bandwidth and long-call evidence remain pending; do not publish automatically.

## 0.3.1 device-check iteration

User revised capture scope to allow an explicit local camera/microphone check before pairing. Verify the distinct permission lease cannot authorize calls, expires/revokes, and rejects overlapping calls; test live preview/meter, zero initial monitoring gain, explicit listen/off, cancellation/late tracks, failed permission recovery and settings/mini/lifecycle cleanup. Keep capture off when Settings opens. Verify red Reset and bordered Settings at compact/normal sizes. Use generated devices for automated tests; physical headphone routing remains pending. No recording or tailnet mutation.
