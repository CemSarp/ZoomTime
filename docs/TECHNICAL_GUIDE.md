# ZoomTime — technical guide

> Moved from the project README on 2026-10-15 so the README can stay a friendly overview. Keep technical installation, controls and troubleshooting details current here. [← Back to the README](../README.md)

A private two-person Mac calling app with a small, resizable floating window. Each Mac plays its own movie. No application-imposed call-duration limit, recording, analytics, screen sharing, or paid calling provider.

**[Version 0.3.4 is the current GitHub prerelease](https://github.com/CemSarp/ZoomTime/releases/tag/v0.3.4).** Local real-WebRTC, signaling, security and packaged tests are documented in [verification](VERIFICATION.md). An earlier host full-screen test passed, but the later Safari Mini failure still needs controlled verification of this release's panel candidate. The partner Mac, actual cross-network calling, hardware routing and three-hour movie session remain unverified. Local generated-media tests do not establish those results.

## What changed in 0.3.4

Independent regular/Mini always-on-top settings, optional experimental speaker echo reduction, a Safari panel candidate and user-initiated Install and restart for future releases. See [release notes](releases/v0.3.4.md) and [update instructions](UPDATES.md). Earlier updater builds need one guided Finder replacement to obtain the installer.

## What changed in 0.3.3

Guest invitation import can continue when Tailscale CLI status is unavailable/non-JSON; connect in the GUI if needed. Hosting retains strict status checks and normal TLS/authentication. A0.3.2 host remains compatible. See [pairing troubleshooting](#guest-invitation-import-error) and [release notes](releases/v0.3.3.md). Already on0.3.2? Use Settings → App updates, download and verify, then quit and replace the app in Applications.

## What changed in 0.3.2

Open **ZoomTime → Check for Updates…** in the Mac menu bar, or **Settings… → App updates → Check for updates**. A newer GitHub build offers **Download update**, then **Show verified download in Finder**. End your call and quit, open the ZIP, drag ZoomTime into Applications and choose **Replace**, then reopen it. The app selects Apple Silicon/Intel automatically, verifies SHA-256 and retains macOS quarantine. Pairing/preferences stay in your profile. No background checks, automatic replacement, downgrade or extra service. Clearly labeled prereleases are included because this private project distributes candidates that way. See [updates and installation](UPDATES.md).

This section describes the original0.3.2 updater. The current0.3.4 prerelease adds Install and restart for future updates;0.2.0 has no updater. Older updater builds obtain0.3.4 with one guided Finder replacement. See the [release notes](releases/v0.3.2.md).

## What changed in 0.3.1

Reset Pairing is a red destructive button and Settings is a visible bordered button. Paired actions wrap without overlapping at the compact normal window size.

Open **Settings… → Camera & microphone check → Start camera & mic check** to preview your camera and watch the microphone meter, even before pairing. Turn on **Listen to my microphone** to hear yourself live through the current macOS output device; use headphones to prevent feedback. Listening starts off and is never remembered. Nothing is recorded or sent. Stop check, Done/Escape, mini mode, an incoming/started call, sleep/reload/quit or the two-minute limit releases the devices. End an active call before starting a check. Stop the check to change camera quality; the preview uses the selected quality and mirror preference.

## What changed in 0.3.0

- Mirror your self-preview without flipping what your partner receives.
- Show/hide your self-preview in mini mode with **You**. Resize it with its corner or the size slider in Settings; the same relative size applies in both modes.
- Choose **360p**, **720p** (default) or **1080p** in **Settings… / ⌘,**. Changes apply during a call without replacing its peer connection. These are preferred capture sizes; hardware and congestion can lower actual capture/sent quality. Connection details show actual capture dimensions/fps.
- **Host on this Mac** opens the installed Tailscale app, connects an existing signed-in session when possible, detects the private hostname, and configures ZoomTime’s free private Serve port. No terminal address copying. Initial Tailscale sign-in/VPN approval, tailnet invitations and HTTPS approval still require the account owner. Conflicts/old-hostname services are left unchanged with instructions.
- Full-screen → mini/Dock transitions wait for macOS to finish leaving full screen. Escape exits full screen; ⌘M minimizes to Dock; ⌘⇧M floats the same call.
- System light/dark appearance, compact grouped settings, accessible call controls, and a calmer video-centered layout.

## Install

Download the published0.3.4 app ZIP for your Mac:

- **[Apple Silicon / arm64](https://github.com/CemSarp/ZoomTime/releases/download/v0.3.4/ZoomTime-darwin-arm64-0.3.4.zip)**
- **[Intel / x64](https://github.com/CemSarp/ZoomTime/releases/download/v0.3.4/ZoomTime-darwin-x64-0.3.4.zip)**

[All release assets and notes](https://github.com/CemSarp/ZoomTime/releases/tag/v0.3.4). Download the app ZIP, not Source code.

**[Simple setup: your Mac + your friend’s Mac](NETWORK_SETUP.md)** — separate Tailscale accounts, one shared network, host-only setup, then ZoomTime pairing.


macOS 14+. Apple menu → About This Mac: Apple chip uses **arm64**; Intel processor uses **x64**.

1. Download the matching app ZIP from the release page above. Local builds also remain under `out/make/zip/darwin/{arm64,x64}/`.
2. Compare `shasum -a 256 /path/to/downloaded.zip` with its entry in [the release checksum file](https://github.com/CemSarp/ZoomTime/releases/download/v0.3.4/SHA256SUMS). For the new local builds, use `out/distribution/0.3.4/SHA256SUMS` instead; never compare different versions’ hashes.
3. Extract and copy ZoomTime.app to Applications. Neither Node nor Xcode is needed to run it.
4. This private build is ad-hoc signed and unnotarized. For a verified build you trust, use [Apple's per-app approval procedure](https://support.apple.com/en-gb/102445). Do not disable Gatekeeper globally or clear unrelated quarantine attributes. If macOS offers no approval, report the exact message.

The previous 0.1.0 probe archives remain available; keep them while testing replacements. Update downloads are user-triggered; replacement uses Install and restart in 0.3.4 or newer, with Finder as a fallback. The stable name/bundle identifier helps preserve settings; ad-hoc signing can still cause Keychain or permission prompts on updates. There is no publisher identity or hardened runtime in this free private distribution profile. Renderer sandbox/isolation, CSP, TLS verification and ASAR integrity remain enabled.

## Pair and call

Complete [one-time private network setup](NETWORK_SETUP.md) first. Both Macs need Tailscale and both apps must be open. Network setup runs only after an explicit Host or Join action. Hosting inspects Serve before configuring its private port; other services, grants and Funnel are never changed.

On your Mac, choose **Host on this Mac**. The app detects the endpoint and configures its private service. The advanced **Manual host setup** remains available when Serve is already configured. Choose **Copy invitation** and share it only with your partner; the invitation contains a secret. On her Mac, copy it to the clipboard and choose **Paste partner's invitation**. Credentials stay in main-process Keychain-backed encrypted storage; the renderer never receives them. The invitation is not an encrypted document.

When both participants are online, choose **Call your partner**, then **Accept call** on the other Mac. Camera/microphone capture starts only after these actions. If a camera fails, **Try microphone only** is an explicit fallback; microphone denial never silently starts a normal call. Use headphones for the first movie tests.

Choose **Mini window** to keep the partner visible. This shrinks the same window; Dock minimization hides it. It can resize to 160×90 logical pixels, with aspect-fit video. Hover or Tab exposes microphone, camera, restore and end controls. The self-preview stays muted. Enable it in mini mode with **You** or Settings. Mode changes do not create a new renderer, peer connection or capture session.

| Action | Control |
| --- | --- |
| Normal / mini | Mini window or ⌘⇧M while ZoomTime is active |
| Restore | Arrow; Escape while focused; Window menu; ⌘⇧R |
| Move / resize mini | Drag background / window edge |
| Mute | Disables transmitted microphone audio; hardware capture remains active |
| Camera off | Stops/releases the camera track; turning it on reacquires a track |
| End | End call / mini × during a call; devices are released |
| Close / quit | Native close, ⌘W or ⌘Q ends capture and exits |
| Settings | Settings… or ⌘,; mirror, quality, mini self-preview, preview size |
| Dock minimize | − in the title bar or ⌘M; leaves full screen first |
| Device recovery | Recover devices acquires the current macOS defaults, preserving mute |

**Reset pairing…** revokes the old guest after a successful encrypted save. Recreate the host and send a new invitation. If Keychain cannot save the reset, the host and capture stop and the app explicitly reports that revocation was not saved. Unlock Keychain and retry Reset before relying on revocation. Retry connection deliberately ends a current call; brief signaling outages otherwise recover automatically while retaining working media.

## Guest invitation import error

An error mentioning `pairing:import`, `Unexpected token 'T'` and `The Tailsc…` comes from parsing Tailscale CLI status before invitation validation. It does not identify a bad invitation. The0.3.3 patch lets guests continue when CLI status is unavailable/non-JSON: open Tailscale and connect to the shared network, then paste the complete host invitation again. The private WSS connection still verifies TLS and authentication; CLI fallback never marks the VPN or host as online. Automatic hosting still needs valid CLI status. Supported stopped-session auto-connect remains available on both roles. No reset/new credentials are required solely for this error.

Only the guest needs this compatible patch to fix import;0.3.2 hosts remain compatible. Replace the app after quitting, leaving existing pairing/profile intact. This patch is published as [v0.3.3](https://github.com/CemSarp/ZoomTime/releases/tag/v0.3.3). If the next status is Host unavailable, inspect actual Tailscale/private Serve reachability; a successful import is not proof of WebRTC connectivity.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Host unavailable | Host app open, both Tailscale connections active, private Serve target/port correct. A proxy's 5xx response is a network failure and retries automatically. |
| Pairing rejected | Fresh invitation, correct host, no competing instance. Reset/import again only when needed. |
| Certificate error | Correct private hostname, Tailscale HTTPS and system clock. Never bypass TLS checking. |
| Permission denied | macOS Settings → Privacy & Security → Camera / Microphone; allow the trusted ZoomTime build, then explicitly retry Call/Accept. |
| Camera busy / missing | Close the other camera app, retry Camera/Recover devices, or explicitly use microphone only. |
| Signaling works, media fails | Check direct connectivity and device grants. `iceServers: []`: no STUN or TURN fallback. Do not add services or rewrite SDP silently. |
| Keychain failure | Unlock Keychain and retry. No plaintext fallback. A changed ad-hoc build may prompt again. |
| Sleep or lid closure | The old call ends; wake does not reopen the camera. Start a new call explicitly. |
| Video stale | Diagnostics use received media statistics; after a short debounce the host attempts one ICE restart, with bounded recovery. |

**Connection diagnostics** shows non-secret WebRTC state, candidate types, coarse route observations, bandwidth, frames, packets and RTT. It does not log raw SDP, credentials or IP addresses. A successful private signaling connection does not prove that media uses Tailscale. Its encrypted DERP relay is separate from TURN.

## Develop and verify

Tested toolchain: Node 24.21.0, npm 11.19.0, macOS 26.6.2 arm64; Node 24.12+ required. Dependencies are exact-pinned with the lockfile.

```sh
npm ci
npm start
```

```sh
npm test
npm run typecheck
npm run lint
npm run test:media
npm run make:arm64
npm run test:packaged
npm run make:x64
npm run checksums
```

Build architectures sequentially because Forge shares intermediate output. `test:media` uses two isolated Chromium renderers, real authenticated WebSockets and real WebRTC with generated audio/video. It deliberately reorders ICE, interrupts signaling, checks media controls/cleanup and includes a real 60-second ring timeout. It also exercises real getUserMedia permission handling with test-only generated devices. It never acquires hardware devices; its two windows are a test fixture, not the shipped app architecture.

`test:packaged` launches its own arm64 instances with isolated user data and temporary loopback debugging, checks both window sizes, renderer/video-element continuity, the narrow bridge/CSP/navigation/permissions, real safeStorage and host/reset behavior, and stops its own processes. For another native architecture use `node scripts/smoke.mjs /absolute/path/to/ZoomTime.app`. Intel execution still needs an Intel Mac. Debugging is not enabled during ordinary launch. Evidence is written under `out/verification/`.

After committing final source and rebuilding, `checksums` writes version-specific hashes and a build manifest recording revision/dirty status, dependency pins, lockfile hash, architecture and exact build commands. Old-version archives are excluded from the new manifest. No artifacts, pairing, logs or personal configuration are committed.

[Architecture and reasons](ARCHITECTURE.md) · [Network setup](NETWORK_SETUP.md) · [Release acceptance](ACCEPTANCE.md) · [Verification](VERIFICATION.md) · [Current handoff](../HANDOFF.md)

## Experimental speaker echo reduction (0.3.4 prerelease)

1. Open Settings and enable **Reduce speaker echo · Experimental** on each Mac that uses speakers.
2. Start a new call, or start a local camera/microphone check. Changing the switch during a call applies on the next microphone session; it does not interrupt the current call.
3. Read the status beneath the switch. Applied means the microphone reports system-audio cancellation mode; Unavailable means normal call echo cancellation continues. Enabled alone does not mean it has applied.
4. With your partner, compare the same movie scene at a moderate volume with the option off/on in separate calls. Test silence, your speech over the movie, both partners speaking and changes of output device. Report leakage or distorted/missing speech. Use headphones if the result is poor.

The local check meter shows microphone level, not a measurement of echo removal. Listening to your own microphone through speakers can feed back: use headphones for that particular check. macOS may request system-audio consent for the experimental mode; do not bypass a refusal. Cancellation varies with hardware, runtime, room and volume and cannot guarantee zero movie audio. The app records nothing and does not send a separate system-audio stream.

## Install-and-restart updates (0.3.4 prerelease)

Install this updater-enabled build once in /Applications or your own ~/Applications folder. Earlier0.3.2/0.3.3 versions still use their guided Finder replacement for that first upgrade. This is expected: a new release cannot rewrite the updater code inside an old binary.

For later releases: open Settings → Check for updates, review the version/prerelease label, choose Download update, finish your call/check, then choose Install and restart. The app verifies the architecture/download/app, prepares it, quits, keeps the previous bundle beside ZoomTime as a recovery backup and opens the replacement. Nothing is compiled on your Mac. Pairing and preferences remain outside the application bundle. No update check or installation starts at app launch.

If the folder is read-only or the app is running from Downloads/a ZIP/disk image/translocation, the installer refuses safely; move the app into a writable Applications folder or use the verified Finder download. No administrator/password helper is included. If macOS blocks the new unnotarized build, follow Apple's supported per-app Open Anyway procedure for the trusted build. Keychain or media permission may be requested again; never disable Gatekeeper or clear quarantine globally.

Old apps are named ZoomTime-previous-VERSION-UUID.app beside the installed app. They and download jobs are retained; they consume space. If a crash/power failure interrupts the short replacement interval and ZoomTime is missing, restore the preserved previous app to ZoomTime.app in Finder. A placement/launch-command failure normally restores it automatically, but normal macOS approval and a healthy restart cannot be guaranteed by the command's return code alone. No archive, backup or profile is deleted automatically.
