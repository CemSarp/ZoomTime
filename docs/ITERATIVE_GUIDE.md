# Iterative implementation guide

## v0.5.0 publication revision —2026-10-21

The user explicitly requested pushing the completed changes and publishing v0.5.0 as a GitHub prerelease, updating the default-branch README, installation/update guidance and release notes. This supersedes earlier iteration-specific no-publication statements. Use a clean source commit, annotated tag and freshly signed arm64 artifacts; retain historical bundles and profiles. The first persistent-identity migration has a full ZIP and signed native feed, with no delta from older ad-hoc builds. Later compatible signed releases can use verified deltas and full fallback.

Fresh publication checks:151 unit tests, generated2–5-client media,8 renderer scenarios, pinned signing fixtures, typecheck/lint and diff checks pass. Native installation fixtures and final packaged artifacts are being verified; final publication evidence follows separately. The occupied-host packaged group remains pending by user choice. Screen Recording permission recovery remains a known bug; real two-Mac permission continuity, network/acoustic and long-session acceptance remain pending. Publication does not replace installed apps or reset trust/TCC. See [release notes](releases/v0.5.0.md).

## Live speaker echo revision —2026-10-21

Follow [the live-switching ledger](superpowers/plans/2026-10-21-live-speaker-echo.md). Preserve the current call/camera/peer/mute/gain identities, real authorization leases/deadlines, rollback and immediate cancellation cleanup. Verify the actual reported processing mode, not successful constraint calls alone. Keep acoustic/permission evidence pending despite removal of the Experimental label. The authorized testing copy may be updated with its predecessor preserved; no publication automatically follows.


## 0.5.0 UI refinement —2026-10-21

Use [the UI ledger](superpowers/plans/2026-10-21-ui-refinement.md) and [complete control review](UI_UX_REVIEW.md). Run source checks, `npm run test:ui`, generated group-media regressions and a fresh signed build/package UI check. Preserve accessible labels, focus, minimum sizes, media identity and existing security/session guards. Retain every unavailable physical gate and any intermittent native result; do not publish/install over user apps as part of this pass.


## 0.5.0 incremental update iteration —2026-10-18

Execute [the approved ledger](superpowers/plans/2026-10-18-incremental-updater.md) sequentially. Prove same-certificate signing and native A→B→C before adopting native updates. Retain strict transport, verification, explicit actions, active-session restart guards, exact signed bases and backups. Test delta byte savings, full fallback, corrupt/wrong-identity rejection, paths, cancellation and recovery. Retain independent physical permission/group gates. Do not publish this candidate or replace installed apps as part of this iteration.

Every phase reads ARCHITECTURE.md, AGENTS.md, and HANDOFF.md. Preserve decisions and their reasons, locked dependencies, focused tests, and actual verification evidence. Report changes, commands/results, pending physical evidence, risks, and next prerequisites. The user explicitly authorized continued software implementation on 2026-10-14 after their own-Mac full-screen success. Physical gates now block release acceptance; unavailable evidence must stay pending. An observed cross-network failure still blocks this no-TURN version.

## 0 — Contract

Record the complete agreed constraints, reasons, rejected alternatives, trust boundaries, call lifecycle, direct-only limit, distribution tradeoffs, and reproducible commands. Do not configure live services. Contract complete; implementation status is in HANDOFF.md.

## 1 — Window probe

One sandboxed persistent renderer with labeled synthetic motion and frame counter. Normal/mini, 320×180 to 160×90, saved separate bounds, available-display recovery, floating across full-screen Spaces, accessible restore and keyboard controls, no repeated focus stealing. Future packaging targets arm64 only (Intel retired2026-10-17). Actual full-screen playback on both Macs is the gate, not a mocked window flag.

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

Stable name/bundle identifier, arm64 only, supported helper signing, no paid Apple membership/notarization. No secrets/logs/dev servers in packages. SHA-256, source revision, lockfile and exact build commands. Test downloaded clean install and update on her Mac without Node/Xcode. Document supported per-app approval, Keychain/permission prompts; never disable security globally.

## 8 — Movie session

Packaged real three-hour two-network call. Test both audio/video directions, native full screen, resize, mode switching, controls, permissions, device release, memory/CPU/bandwidth/thermals. Also Spaces, display removal, audio-device changes, outage, Tailscale, departure, sleep/wake, second call. Redacted in-app statistics; no raw SDP/credentials/addresses logged by default. Record hardware/OS/revision/route/duration/results; unavailable scenarios remain untested.

## Completion and maintenance

Done means actual two-Mac evidence, not compilation: authenticated usable calls, full-screen small view, three-hour session, controls/recovery/cleanup, no unwanted services/payments, reproducible builds and handoff. Update Electron periodically and rerun connection/window/permissions/package tests. Retain the working build while testing replacements. Never guarantee connectivity or unlimited availability merely because there is no app duration limit.

## 2026-10-15 scoped iteration

The user requested local-preview mirroring, optional resizable mini self-preview, quality controls, explicit in-app Tailscale Host setup, a full-screen/minimize fix and macOS visual refinement. These revise the partner-only mini and fixed360p defaults without changing the no-STUN/TURN architecture. Verify preferences migration/validation, Serve conflict preservation, actual native full-screen exit, preview/mirror/UI controls and live resolution changes. Actual two-device camera quality, CPU/bandwidth and long-call evidence remain pending; do not publish automatically.

## 0.3.1 device-check iteration

User revised capture scope to allow an explicit local camera/microphone check before pairing. Verify the distinct permission lease cannot authorize calls, expires/revokes, and rejects overlapping calls; test live preview/meter, zero initial monitoring gain, explicit listen/off, cancellation/late tracks, failed permission recovery and settings/mini/lifecycle cleanup. Keep capture off when Settings opens. Verify red Reset and bordered Settings at compact/normal sizes. Use generated devices for automated tests; physical headphone routing remains pending. No recording or tailnet mutation.


## 0.3.2 explicit GitHub update iteration

User approved Check → verified download → guided Finder replacement. Test numeric versions/no downgrade, architecture selection, flagged prereleases, exact publisher URLs, invalid metadata, TLS/redirect boundary, digest/size failure, retry, serialized operations, no startup network/download and no raw URL/path bridge. Exercise the real GitHub API and an isolated real older-release download without installing/downgrading. Verify macOS quarantine is added and retained. Packaged UI must show installed version and explicit check results without loosening renderer networking. Rebuild both architectures, preserve old artifacts, and record source/checksums. Do not publish automatically; actual downloaded replacement, trust/Keychain behavior and partner-Mac execution remain pending.


## 0.3.3 guest import correction

Reproduce the raw Tailscale non-JSON status failure before changing behavior. Verify guest fallback for text/invalid object/unavailable CLI, strict redacted host rejection and unchanged stopped-session auto-connect. Keep invitation capture main-only and before asynchronous app opening, with existing validation/authentication intact. Run full unit/typecheck/lint and packaged regression checks; build both architectures. Actual guest Mac and real private WSS/media evidence remains pending. Do not publish automatically or alter the live tailnet.

## 0.3.4 experimental microphone iteration

User requested rebuilding current punctuation/text edits plus opt-in speaker echo reduction. Preserve existing UI edits. Verify default-off/legacy migration, strict preference IPC, next-session-only application, actual track-setting status, unsupported-mode normal-call behavior, local check and device recovery, mute and capture cleanup. Test real bundled WebRTC with generated media and rebuild both packages. Do not equate supported constraints or generated-media tests with suppression of Safari/QuickTime sound through Mac speakers. Test acoustically on both Macs before promoting the experiment; retain other physical release gates.

## 0.3.4 install-and-restart iteration

User revised guided-only updates to explicit in-place install/restart before publication. Reuse fixed GitHub metadata/download verification; never build from source on the recipient. Test strict archive extraction (links, traversal, bounds, duplicates), signed fixture staging, bundle/version/architecture, quarantine, private helper handoff and parent wait, call guards, backup preservation and rollback. Package both architectures, keep the renderer bridge narrow, and keep Gatekeeper/Keychain/real installed upgrade evidence pending until physically tested. Do not publish automatically or delete old bundles/jobs/profiles.

## 2026-10-17 native capture iteration

User explicitly revises screen-capture scope. For a separately authorized build, build the bundled Swift helper for arm64 with macOS14 floor. Run `npm run test:capture` (real Metal composition and hardware H.264 encode/decode with labeled synthetic images, including slow-transport backpressure), `node scripts/capture-live-test.mjs` (real controlled windows/display), and `node scripts/capture-app-test.mjs` (packaged UI, isolated profile). Live tests require Screen Recording consent and create local private evidence; never reset TCC or alter security to make a test pass. Keep outputs local. Run full npm tests/typecheck/lint/diff; validate PNGs and decode saved H.264. Distinguish source switching on one screen from two-physical-display switching. Actual OS denial/recovery, protected-content availability, two-Mac transport, hardware power/long-call evidence remain separate gates. Do not promote private symbols to capture sources without known ABI, privilege requirements and verified images.

## 2026-10-17 source-only follow-up

User requests `codex/screen-capture` branch and GitHub source push, retires Intel/Rosetta and explicitly prohibits new builds now. Run full unit tests, TypeScript/lint/diff checks, Swift `-typecheck` only and script syntax checks. Do not run npm start/package/make, native build/test:capture, checksums or GUI tests against stale binaries. Retain all old artifacts/releases. Confirm source branch/remote and exact committed files; push without force. Document the TCC signature mismatch and earlier Codex attribution; repeat actual permission recovery only after a future build is authorized.


## 2026-10-17 group calling source-only iteration

The approved [group design](superpowers/specs/2026-10-17-group-calling-design.md) revises the two-person cap to one named2–5-member group and one active call. Follow the [sequential task ledger](superpowers/plans/2026-10-17-group-calling.md). Preserve one renderer/shared capture; isolate peer negotiations and failures; explicit named recipients/acceptance; individual credentials/ciphertext migration backups; leave vs host shutdown; strict authenticated pair routing and narrow IPC. All members update to protocol v2.

Run full source/unit/type/lint/diff and harness syntax checks. Do not run app/helper builds, npm start, GUI/native/media harnesses or release/install tasks in this source-only iteration. Future authorized generated-media checks must assert every directed link at2/3/4/5 members and preserve existing two-person lifecycle/permission tests. Actual Macs, all guest-to-guest routes, full-screen/player behavior, downloaded install/migration and60-minute/three-hour group performance remain pending physical release gates. Screen transmission is deferred. Do not change live tailnet settings or deliver invitations automatically.

## 2026-10-17 authorized experimental test build

The user subsequently authorizes building and updating ZoomTime Experimental locally. Preserve old output/bundle, build arm64, verify current code/signatures and run isolated generated-media/package checks. Do not replace the regular app or publish. The current test-build results and exact rollback/artifact paths are in HANDOFF and VERIFICATION; physical acceptance remains pending.

## v0.4.0 publication iteration

Explicit user publication authorization supersedes earlier no-build/no-release restrictions for this candidate. Verify the scoped source diff and complete checks, commit current source/version/docs on the existing feature branch, build from clean source, validate arm64/signatures/fuses/payload/ZIP and provenance, push the branch and annotated tag, upload exact updater-compatible assets to a draft, verify remote sizes/digests, then publish as prerelease. Verify anonymous in-app discovery and an actual0.3.4 updater download with quarantine/checksum, using isolated profiles. Do not install over user apps to prove downloading. Publish the screen-capture permission bug and outstanding physical evidence clearly.
