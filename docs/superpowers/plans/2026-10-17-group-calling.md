# Group Calling Implementation Plan

> For Codex/Claude Code: execute sequentially inline, using superpowers:executing-plans when available. Read AGENTS.md, docs/ARCHITECTURE.md, docs/ITERATIVE_GUIDE.md and HANDOFF.md first. Resume from this ledger and the actual diff; do not redo completed tasks. Do not merge, publish, send invitations, change live tailnet settings, delete files, or build app/helper binaries.

**Goal:** One secure named 2–5-person mesh call, preserving the two-person workflow.
**Architecture:** Existing main-owned private signaling and encrypted pairing; participant/pair authority; shared renderer capture with isolated per-peer negotiation; one persistent adaptive view.
**Stack:** Existing Electron44/TypeScript/plain HTML/CSS/ws/Node tests. No dependency additions.
**Spec:** ../specs/2026-10-17-group-calling-design.md
**Acceptance:** ./2026-10-17-group-calling-acceptance.md

## Global constraints and review focus

Source-only, arm64/macOS14+, one BrowserWindow, no STUN/TURN/public server/screen transmission. No secrets in renderer/logs/URLs. Pairing migrations preserve ciphertext/credentials. Late asynchronous work cannot resume departed memberships. Host media departure must preserve others; host coordinator shutdown must clean up. Failed peer operations cannot strand or corrupt shared capture. No generated-media results represented as physical evidence.

## Tasks

For each: add focused behavior tests first, observe RED, implement minimum change, run focused tests then full npm test/typecheck/lint/diff; record commands/results here. Do not mark integration or hardware evidence passed without running it.

- [x] Task1: contract revision and ephemeral-port CallingService tests. Inject production-default47831/test0; local client uses bound port. Run tests with an occupied production port without disturbing its listener.
- [x] Task2: participant IDs, five-member encrypted directory, names/individual credentials, invitation parsing, legacy backup/migration, host member management. Tests: limits, duplicate names/tokens, ciphertext persistence, failure/revocation, legacy host/guest credentials.
- [x] Task3: coordinator targeted calls/invitations/accept/reject/leave, one call, deterministic pair offerers/generations, collision handling, independent deadlines/failure. Test2→5, capacity, matching/unrelated requests, stale invitation, healthy pair continuity, host media leave, guest/host recovery, final member cleanup.
- [x] Task4: authenticated member sockets, sender-stamped pair routing, v2 incompatibility, independent persistent bounded traffic budgets. Real socket tests for five clients, identity/pair forgery, invalid/binary/oversized input, duplicates, revocation and reconnect limits.
- [x] Task5: main/bridge/preload member operations and operation-bound capture leases; local Leave vs host shutdown/reset; device checks; update/host retry guards. Test late/cancelled acceptance/capture, unauthorized targets, inactive host coordinating a group, uninvolved device checks.
- [x] Task6: MediaPeer extraction; shared MediaCall stream/map; per-pair signaling/recovery/stats; one capture/reacquisition, mute-safe all-sender replacement and cleanup. Source-test queue/epoch/failure logic; extend browser assertions for later execution.
- [x] Task7: named contacts/recipient selection, incoming names, active invitations/statuses, stable grid/pin/unpin, speaker highlight, accessible compact actions. Behavioral tests for speaker selection/order/leave, element continuity and no duplicate audio; update packaged smoke.
- [x] Task8: generalize real-WebRTC/generated-media and smoke harnesses for2/3/4/5 endpoints, ten bidirectional links, per-peer received audio/video, unchanged healthy links, partial failure, host-media leave, rejoin and resource cleanup. Syntax/type-check harnesses now; actual media/package execution remains pending build/test authorization.
- [x] Task9: update README, architecture, technical/network/manual guides, acceptance and HANDOFF. Full source checks and complete-change independent review, fix meaningful findings with regressions; preserve historical evidence. No publishing/build/install.

## Agent handoff

Report source changes, actual commands/results, unresolved findings and physical/build evidence pending. Build and release are separate future authorization. Do not automatically create commits or publish as a substitute for an unverified feature.

## Execution ledger

- Baseline: clean codex/screen-capture at1b12a8f; planning turn observed96/96 unit tests, typecheck/lint/diff pass. Recheck source state before final claims.
- Ruling: work in the existing clean feature-branch checkout requested for this task; no branch switch, separate worktree, or dependency installation. This preserves the existing source workflow and avoids moving the user's checkout.
- Pre-flight: Tasks2–5 share the versioned identity/pair protocol; update every parser/caller/test together before full-suite completion. Tasks5–7 share capture ownership and local membership. Task8 must consume the same v2 engine, not a compatibility or test-only engine.
- Ruling: record progress in this tracked document; retain all scratch/evidence rather than deleting skill workspaces, following the user's no-deletion requirement.
- Task1: occupied-port regression observed RED then GREEN with isolated CallingService port; baseline suite97/97 passed. Full source checks will be repeated after v2 callers migrate together.
- Task2 RED: four group-pairing behaviors fail against v1 (version, member registry, ciphertext backup, failed migration). Implement v2 directory and migration next.
- Tasks2–4: observed migration/coordinator/socket REDs against v1; v2 migration4/4, coordinator10/10, actual socket/client8/8 pass. Registry uses stable UUIDs and per-member credentials; mesh rate test forwards400 authorized ICE messages without borrowing another pair's budget.
- Task5: operation/recipient leases, host-media Leave, secure registry updates and reset tests added. Integration caller migration continues; full type/suite verification pending all renderer/harness changes.

- Tasks1–8 source implementation complete: participant protocol/directory,11 coordinator behaviors, real loopback routing/client tests, operation-bound service,9 media-ownership/race/timer tests and2 view/speaker tests. Browser/package harness source is updated and syntax/type checked; execution remains expressly pending.
- Ruling: add src/call-view.ts for persistent keyed DOM and speaker selection, with focused tests; this keeps participant rendering out of the call/track owner without a framework or second engine.
- Fixed before review: expired attach could bypass membership recovery; joining during device recovery could retain stopped tracks; stale early ICE could fill a new generation queue. Each regression observed RED then GREEN.
- Source verification: full npm test119/119, TypeScript/lint/diff checks and four modified JS/CJS harness syntax checks pass. Evidence: out/verification/group-source-unit.log. No app/helper binary build or GUI/media execution.

- Independent whole-change review found four functional issues: renderer importing main-only dependencies, revoked inviter snapshots rejected by the parser, generation changes discarding queued track replacement, and unsupported Electron prompt-based Rename. All fixed. Browser-safe contracts now live in src/calling-state.ts; caller/inviter IDs are historical references, not authorization; capture replacement survives negotiation generations; Rename uses an accessible HTML dialog.
- Review regression results: observed three focused REDs, then GREEN for browser runtime import graph, revocation through the real snapshot parser and delayed-offer/replacement race. The browser source check also rejects unsupported prompt calls. Smoke source now clicks the actual Rename control and saves its form; execution pending.
- Strengthened the future media harness to load product CSS, verify three hidden tiles while pinned, measure continued packet/frame progress over six seconds, and require decoded frames at every endpoint before pinning. Syntax/type checks pass; no runtime result claimed.
- Additional source regressions observed RED then GREEN: a stalled device recovery times out after sixty seconds; leaving while replacement awaits releases both old and new tracks immediately. Keep retiring capture owned until replacement completes or the session stops.
- Final source verification on codex/screen-capture, base1b12a8f, uncommitted working tree: npm test **124/124**, npm run typecheck, npm run lint, node --check for scripts/media-test.mjs, scripts/smoke.mjs, tests/media-main.cjs, tests/media-preload.cjs, and git diff --check pass. Unit evidence: out/verification/group-source-unit.log. No dependency/version change, app/helper build, media/GUI/package execution, installation, release, publication, live tailnet modification or invitation delivery.
- Tasks1–9 are complete for source implementation and documentation. The separately listed executable and physical acceptance matrix remains pending; five-person real-network performance is unaccepted until that evidence exists.

## Subsequent user-authorized local build

Local experimental group build completed: /Users/cemsarp/Desktop/ZoomTime/out/group-experimental-20261017-183652. Installed /Applications/ZoomTime Experimental.app with deep/strict signature and installed ASAR digest verified. Previous bundle: /Users/cemsarp/Desktop/ZoomTime/out/group-experimental-20261017-183652/previous/ZoomTime Experimental.app. The regular /Applications/ZoomTime.app digest is unchanged. Source base1b12a8f plus the uncommitted group changes, version0.3.4, arm64/macOS14+. Fresh124/124 unit tests, typecheck/lint/diff pass; make:arm64 and native helper build/signing pass. Five packaged compiled assets match fresh Forge output. Packaged smoke:28 checks at320×180 and160×90. Real local generated-media suite passes in153.127s across2/3/4/5 contexts, all ten bidirectional links, continued audio/video while pinned, guest-pair recovery, host media Leave, explicit rejoin and complete cleanup. This duration is the whole test suite, not a continuous call benchmark.

The first packaged run exposed a pre-existing invalid top-level-await preference expression in the smoke harness; async IIFEs repair it. The media protocol handler now serves the product CSS so hidden-tile assertions exercise actual layout. These changes affect tests only. Evidence logs/reports, SHA256SUMS and build-manifest.json are retained in the candidate directory. ZIP: ZoomTime-Experimental-group-arm64.zip; SHA-256 d367fdc721e9ede609b2fb05e90f2848578c6b0bfb9fbfd805a722153bb04e08.

No real profile was read or launched, no hardware camera/microphone or screen capture was requested by these generated-device tests, and no publication, live tailnet edit or invitation delivery occurred. All participants need this protocol-v2 candidate; existing encrypted pairing migrates when the user launches it. Actual legacy-Keychain migration prompts, downloaded installation/update, real2–5-Mac pairwise media, acoustics/permissions/full-screen overlays and60-minute/three-hour measured performance remain pending.

## User-requested publication — v0.4.0

Explicitly requested publication is complete: https://github.com/CemSarp/ZoomTime/releases/tag/v0.4.0 (non-draft prerelease, Apple Silicon/arm64 only). Application-source commit and annotated tag: 24ffa154292e3343e29af78f69b6f40cdf49f1b6, built from clean source on codex/screen-capture. Branch and tag are pushed without merging/switching main; historical releases and installed apps remain unchanged. The four assets (arm64 ZIP, INSTALL.md, portable SHA256SUMS, build-manifest.json) matched local sizes and GitHub SHA-256 digests before and after publication. ZIP SHA-256: 7d8fc647b96afb46bb786991b333ab5dbb0ca2eb290496dd92a77ab640fb1f4a.

Fresh verification:125/125 tests, typecheck/lint/diff and runtime audit0 advisories. Arm64 build/native helper, signatures/fuses/privacy/version/macOS14 metadata, five compiled-source assets, ZIP integrity and actual updater extraction validation pass. Release generated-media suite passes in153.692s across2/3/4/5 browser clients, all ten bidirectional links, hidden-media progress, isolated recovery, host media departure/rejoin and cleanup. Packaged checks pass28 groups at each Mini size. Initial packaged host test failed because the user's Experimental host occupied47831; the user explicitly quit it and the full rerun passed. No real host was stopped by the agent.

Anonymous production updater discovery offers0.4.0 to0.3.4 and refuses an equal-version update. The actual installed0.3.4 app was launched with an isolated profile; real Settings Check/Download actions fetched the published ZIP and reached Ready. SHA-256 and retained quarantine were independently verified, and the installed app ASAR was unchanged. Evidence: out/release/0.4.0/in-app-update-proof.json, anonymous-discovery.json, github-published-final.json, build-manifest.json and retained logs/reports. Downloading is proven; Install/restart, Gatekeeper/Keychain approval and real-profile migration remain pending. Renamed ZoomTime Experimental.app previews can download but the fixed-path installer only accepts ZoomTime.app in /Applications or ~/Applications; the release guide gives the verified Finder path for those previews.

Known screen-share/screen-capture permission bug is prominently disclosed in GitHub notes, README and INSTALL: Screen Recording may repeatedly request access or remain denied. It remains unresolved. Native capture is local diagnostics only; partner screen transmission/protected-video capture is not implemented. Actual2–5-Mac/two-network routes, hardware/full-screen/player behavior and60-minute/three-hour measured group performance remain pending. No invitation or live tailnet change was made.
