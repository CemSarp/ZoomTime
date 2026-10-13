# ZoomTime

A private Mac app for seeing your partner in a tiny floating window while each person separately plays a movie.

**Current build: window feasibility probe, not a calling app.** It shows labeled synthetic moving circles and a live frame counter. There is no camera, microphone, FaceTime capture, recording, signaling server, or Tailscale configuration in this milestone.

The approved plan requires the small window to pass actual full-screen tests on **both Macs** before networking work. See [the manual test sheet](docs/MANUAL_TESTS.md) and [current handoff](HANDOFF.md).

## Try the packaged probe

macOS 14 or newer. Apple menu > About This Mac: choose `arm64` for an Apple chip or `x64` for an Intel processor.

1. Use the matching archive under `out/make/zip/darwin/arm64/` or `out/make/zip/darwin/x64/`.
2. Send the matching archive plus its checksum from `out/distribution/SHA256SUMS`. On the receiving Mac, run `shasum -a 256 /path/to/the/downloaded.zip` and compare the exact digest. From this project root, verify both with `shasum -a 256 -c out/distribution/SHA256SUMS`.
3. Extract the zip and copy `ZoomTime.app` into Applications. Open it.
4. This privately built app is ad-hoc signed and unnotarized. If macOS blocks a build you trust, follow [Apple's per-app approval instructions](https://support.apple.com/en-gb/102445). Do not disable Gatekeeper or remove quarantine globally. If approval is unavailable, report the exact message.
5. Click **Open mini mode**, move/resize it, and put your actual movie player into true full screen. Check that the circles and frame count continue.
6. Use the restore arrow, Escape while ZoomTime has focus, or Window > Restore normal window. The session ID and elapsed counter should not reset.

No Node or Xcode is needed to run a packaged probe. Do not send a pairing invitation; calling/pairing do not exist yet. Do not grant camera/microphone permissions to this probe.

## Controls

| Action | Control |
| --- | --- |
| Normal / mini toggle | Open mini mode or ⌘⇧M while ZoomTime is active |
| Restore | Mini arrow; Escape while the app is focused; Window menu; ⌘⇧R |
| Resize | Drag a window edge; mini minimum 160×90 logical pixels |
| Move mini | Drag its background |
| Close | Mini ×, native close, ⌘W, or ⌘Q; exits this probe |

Mini controls appear on hover and keyboard focus. Tab reaches restore and close. The window uses aspect-fit drawing and remembers separate mode bounds. Reduced-motion preferences stop the moving circles while the frame counter continues.

## Develop and verify

Node 24.12+ and npm; tested locally with Node 24.21.0, npm 11.19.0, macOS 26.6.2 arm64 and Xcode 27.0.

```sh
npm ci
npm start
```

```sh
npm test
npm run typecheck
npm run lint
npm run make:arm64
npm run test:packaged
npm run make:x64
npm run checksums
```

Forge builds sequentially: both architectures share its intermediate output directory. `test:packaged` launches its own arm64 instances with local debugging and isolated user-data directories; close another ZoomTime instance first. It checks default and minimum mini sizes, renderer identity across transitions, trusted keyboard/hover input, CSP and bridge restrictions. It records screenshots/evidence under `out/verification/`, then exits its own processes. Debugging is not enabled during ordinary launch.

For another matching architecture: `node scripts/smoke.mjs /absolute/path/to/ZoomTime.app`. Intel execution must be tested on the actual Intel Mac; a successful cross-build is insufficient.

`checksums` records exact archive hashes, dependency/lockfile versions, source revision and dirty status. Run it after the source is committed and the final packages are rebuilt. An ad-hoc signature has no publisher identity. The free private packaging profile has no hardened runtime and grants only JIT in this probe; renderer sandbox/isolation, certificate checks, Gatekeeper, and ASAR integrity fuses remain enforced.

For an optional local synthetic browser video, run `node scripts/fullscreen-fixture.mjs`, open the printed loopback URL, and click Enter video full screen. Stop it with Ctrl-C afterward. This is a test tool outside the packaged app; it captures only a generated canvas, no camera, microphone, screen, or recording. It cannot replace testing your real movie player on both Macs.

Verified locally: 15 unit tests, typecheck/lint, both Mac package builds/signatures and arm64 packaged checks. `npm audit --omit=dev` reports zero advisories; the full audit reports eight development-tool advisories (six high, two moderate). The affected dev-server dependencies are not bundled in the app, and the dev server binds to loopback. See HANDOFF for exposure and unresolved physical tests.

## Architecture and next phases

[Decisions and reasons](docs/ARCHITECTURE.md) · [Iterative implementation guide](docs/ITERATIVE_GUIDE.md) · [Window implementation plan](docs/superpowers/plans/2026-10-13-window-probe.md)

Next, after both-Mac window acceptance: authenticated signaling hosted on your Mac through private Tailscale Serve, then a real direct-only WebRTC probe. `iceServers: []` means no STUN/TURN. Tailscale's encrypted DERP layer is separate. Private signaling does not prove media connectivity; if the actual two-network call fails, the agreed plan stops until its architecture is explicitly revised.

No group calls, chat, accounts database, screen sharing, recording, analytics, movie synchronization, mobile client, public hosting, or automatic updates. Later phases must prove packaged permissions, safe storage, teardown/recovery, and a three-hour real movie session. This repository does not currently claim those results.
