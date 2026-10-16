# ZoomTime project contract

Approved 2026-10-13. Audience: exactly two people on their MacBooks. Each separately plays a movie while seeing the partner in a small live video window above other apps, including native full-screen video. No application-imposed call duration limit or paid service.

## Decisions and why

| Decision | Reason |
| --- | --- |
| Standalone Electron + Chromium WebRTC | Reuse the calling engine, codecs, congestion control, and media encryption. Do not invent protocols. |
| No FaceTime companion | Minimized window capture can pause; there is no supported incoming FaceTime stream integration in this plan. |
| No native Swift/WebRTC client | Building/integrating the native engine adds work; the user selected Electron. |
| TypeScript, plain HTML/CSS, maintained Forge Webpack template | Typed boundaries and maintained packaging without an unnecessary UI framework. Forge 8 calls the template `--template=webpack --typescript`. |
| macOS 14+, separate arm64/x64 packages | Both Macs meet this floor; distribution must fit the actual processor. |
| One BrowserWindow, renderer, peer connection, and persistent video elements | Mini mode must not reload/reacquire/renegotiate or depend on a large hidden window. |
| Normal 900×600; mini 320×180; minimum mini 160×90 logical pixels | The view must be substantially smaller than FaceTime and freely resizable. Fit video without stretching; do not force an aspect ratio. The normal minimum is 640×420 to keep its instruction/control area usable. |
| Optional muted self-preview in mini mode; self-preview in normal mode | User revision2026-10-15: let each person choose to see themselves; default mini remains partner-only. Mirroring changes only the local element. A relative preview size follows both modes without duplicating media. |
| Documented floating/full-screen workspace APIs | Achieve the central window requirement without extreme window levels or repeated focus stealing. |
| Separate movie playback | No movie streaming, screen sharing, or synchronization subsystem is needed. |
| Tailscale on both Macs; my Mac hosts signaling while open | No public server, third computer, router forwarding, or paid host. Both apps must run; no offline ringing/push. |
| Loopback backend 127.0.0.1:47831; private Serve HTTPS 8443; /zoomtime | Guest WSS uses a validated tailnet hostname and verified TLS. Host uses authenticated local WebSocket. |
| `iceServers: []`, no STUN/TURN | User explicitly declined relay setup and accepts possible connectivity failure. Never silently add services, SDP address rewriting, insecure Chromium flags, or alternate media transport. |
| Separate random 32-byte host/guest credentials | Tailnet membership alone does not authorize a call. Authenticated transport determines role. |
| Main-process safeStorage | Keychain-backed encrypted credential persistence; fail securely when unavailable, never plaintext fallback. |
| Explicit Call/Accept or local device-check action before camera/mic access | User revision2026-10-15 adds a local pre-call check. Opening the app/Settings must not start capture. Camera off stops/releases its track; mute disables transmitted audio. |
| Prefer 720p/30 fps, with selectable 360p/24 or1080p/30; normal speech processing | User revision2026-10-15 requests improved detail and quality controls. Ideal constraints allow hardware fallback; applyConstraints updates a live track without replacing the peer. No fixed bitrate/codec is forced; WebRTC adapts to congestion. |
| System-default devices initially | Avoid a device-management subsystem; support explicit reacquisition after disappearance. |
| Settings and pairing only; no database/history/analytics/recording | Retain only what this private app needs. |
| Unnotarized Mac packages; explicit GitHub Check → Download → Install and restart | User revision2026-10-16 extends verified downloads with user-initiated replacement, preserved backups and normal macOS approval; no startup polling, elevation or paid signing identity. Finder remains the fallback. |

The two people use separate Tailscale identities: invite the guest into the host’s tailnet rather than sharing a login. This preserves independent identity and revocation. GitHub hosts the app downloads/source, not the signaling service; pairing credentials and personal network configuration are never published.

## Trust boundaries and components

- Renderer owns UI, video elements, local tracks, and RTCPeerConnection.
- Main owns window operations, credentials, socket, settings, and OS integration.
- Preload exposes narrow validated commands/events, never generic IPC, filesystem, shell execution, arbitrary network requests, or URL loading.
- Host coordinator authenticates roles and forwards validated signaling. It does not process media.
- Bundled UI; `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`; production CSP, no remote executable UI, arbitrary navigation, or new windows.
- Camera/microphone permission limited to the trusted UI and active explicit call flow. Other permission requests denied.
- Encrypted standard WebRTC media with authenticated signaling, verified HTTPS, and private signaling exposure. No custom cryptography.
- Endpoint compromise and either participant independently recording remain outside the protection offered.

## Implementation and release evidence

On 2026-10-14 the user reported full-screen playback passing on their Mac only and explicitly requested continued software implementation. This revises the old stop-before-networking workflow: implement and test locally, while keeping the partner-Mac, actual two-network, downloaded-installation and long-session checks as release blockers. Never represent generated local media as that evidence. An observed failure on the actual networks still stops release under the agreed no-TURN architecture.

## Connectivity is a physical gate

Private signaling reachability does not prove media reachability. Chromium ICE must find a usable route on the actual two networks. Inspect selected candidate-pair statistics; do not claim all media uses Tailscale from socket reachability.

Tailscale may use its encrypted DERP forwarding even though WebRTC has no TURN. These are separate layers. Another usable direct route, such as IPv6, may be selected; report actual evidence.

If the real two-network call cannot connect, stop this version and document the failure. Changing the no-TURN decision requires an explicit user revision. Free service terms, internet availability, device power, and sleep behavior cannot guarantee uninterrupted calls forever.

## Pairing and signaling

- Export/import invitation only through an explicit action. It contains a guest endpoint and secret credential; encoding is not encryption. Validate version, role, 32-byte credential shape, and approved `wss://…ts.net:8443/zoomtime` endpoint.
- Credentials stay out of URLs, routine renderer state, logs, source, and packages.
- Reset pairing invalidates the old guest and ends any active call.
- One authenticated connection per role; reject competitors and third clients, do not evict an active call. Single local app instance.
- Versioned text JSON messages: request/accept/reject/cancel, offer/answer, ICE, media state, hangup, reconnect state, actionable error.
- Server assigns call ID. Negotiation generation rejects delayed events; identity comes from authentication, never message claims.
- Maximum 64 KiB/message, no binary payloads or compression, 100 application messages/10 seconds/role.
- Ring timeout 60 seconds; connect timeout 30 seconds; recovery 30 seconds. An outgoing request without a server call-ID acknowledgement also releases capture after 30 seconds; otherwise lost signaling could strand devices before the ring timer starts.
- WebSocket heartbeat every 20 seconds; detect two missed replies.
- Host creates offers regardless of caller. Concurrent matching requests combine into one call.
- Queue early ICE until the relevant remote description is installed; reject invalid transitions and stale identifiers.
- Debounce transient media disconnect for five seconds, then one host-led ICE restart per outage.
- Brief signaling disconnect retains working media during bounded recovery. Expired recovery ends capture.
- States: unpaired, ready, ringing, connecting, connected, reconnecting, ended, actionable error.
- Document Tailscale's recommended standalone Mac app, MagicDNS/HTTPS requirements, and grants limited to the two participating devices. Inspect existing Serve configuration before proposing changes; do not reset or overwrite unrelated services or enable Funnel. Host-candidate ICE may require dynamic UDP ports, so signaling-port access alone is insufficient.

## Window contract

One persistent renderer across normal/mini transitions; no renderer reload or second hidden media-owning window. Free resize, aspect-fit, remembered separate bounds, recovery onto available displays. Native Dock minimize can hide the window; the Mini action keeps the partner visible.

Mini controls remain available on hover and keyboard focus and fit at 160×90: mute, camera, restore, hangup. Normal mode includes partner, muted self-preview, call controls, and status. Mini optionally shows that same self-preview with the same relative size; resizing and mirroring never touch transmitted tracks. Native full-screen exit is asynchronous: mode changes and Dock minimize wait for leave-full-screen, and full-screen/maximized bounds never replace saved normal geometry. Camera-off/stale/reconnecting must not masquerade as live video. Close/quit ends capture. Do not repeatedly steal movie keyboard focus.

The historical 0.1.0 window probe used explicitly synthetic animation. Version 0.2.0 replaces it with persistent partner/self video and real calling controls. The renderer session ID and uptime remain diagnostic only; they do not claim a media connection.

## Failure behavior to preserve

| Condition | Expected behavior |
| --- | --- |
| Tailscale down / host app closed | Distinct network/host-unavailable status; no misleading camera error. |
| Signaling works, media fails | Explain no-TURN connectivity limitation; stop at gate. |
| Invalid pairing / third client / conflicting instance | Reject and provide explicit recovery. |
| Cancel during permission/capture await | Ignore late callbacks; stop late-returned tracks. |
| Camera denied/unavailable/busy | Explain and offer explicit audio-only continuation if mic works. |
| Microphone denied | Explicit permission recovery; no silent normal-call success. |
| Camera off / mic muted | Release camera track / disable transmitted audio; accurate status. |
| Device unplug / AirPods change | Explicit reacquire system default; physically test routing. |
| Brief outage | Bounded signaling reconnect/ICE restart; reject stale generations. |
| Recovery exceeds 30 seconds | End and release all devices. |
| Sleep/lid close/wake | Disconnect; no promise through sleep or automatic new camera session. |
| Renderer reload/crash/app close | Idempotent cleanup, best-effort hangup, unconditional local release. |
| Stale remote video | Detect from media statistics, not socket connectivity alone. |
| Monitor removed / changed scale / off-screen saved bounds | Clamp bounds onto a usable display; preserve restore controls. |
| Keychain fails / update changes signature | Fail securely, explain prompts/re-pairing; no plaintext fallback. |
| Downloaded build blocked | Supported per-app approval for trusted package; never global Gatekeeper disable or broad quarantine removal. |

Use headphones for initial tests; echo cancellation cannot guarantee removal of local movie audio from speakers.

## Exclusions

No group calls, chat, accounts database, recording, screen capture, analytics, movie streaming, playback synchronization, mobile apps, contact discovery, public deployment, hosted STUN/TURN, custom codecs/cryptography, or unattended/background updates. Explicit install/restart is the user-requested exception below.

## Module ownership and lifecycle reasons

| Module | Responsibility and reason |
| --- | --- |
| protocol.ts | Strict, versioned endpoint/invitation/message validation shared by both sides, avoiding inconsistent trust boundaries. |
| coordinator.ts | Server-assigned call IDs, host-offerer, transitions and deadlines. One authority resolves simultaneous requests and rejects stale negotiations. |
| signaling.ts / signaling-client.ts | Main-owned authenticated WebSockets; private loopback binding, limits, heartbeat, TLS checking, reconnect. Credentials never enter the media renderer. |
| pairing.ts | Atomic safeStorage ciphertext persistence; no plaintext fallback or bundled credentials. A failed reset stops the listener but reports that disk revocation is incomplete. |
| calling-service.ts | Role/session/capture authorization, pairing/reconnect/revocation and OS interrupts. Cancelled IDs are remembered so delayed snapshots cannot revive them. |
| main.ts / preload.ts | Single-instance window and OS integration; exact-frame IPC and media permissions. The bridge exposes operations rather than machine-wide capabilities. |
| media-call.ts | One RTCPeerConnection, capture tracks and persistent views; epoch/generation guards stop late work. The answerer reuses offered transceivers to avoid one-way media. |
| renderer.ts | Plain UI derived from network/call/media state; one partner video survives all mode changes. |

Permissions are requested after Call/Accept; main grants a limited capture lease before a call ID exists. Local cancellation withdraws it. Active-call camera/device retries require an explicit action. Late capture results are stopped. Camera off stops its track; mute disables audio before any recovered track can reach an active sender. Quit/crash/close/sleep all interrupt the session; wake does not start a new one.

Negotiation messages are serialized and bounded early ICE is queued until the matching remote description. Host generation increases once per outage, while sender/peer identity persists. Working media continues during a brief signaling outage; the 30-second recovery deadline prevents indefinite abandoned sessions. Statistics expose only coarse candidate-route labels, packet/frame counts, rates and RTT, never raw SDP/IP addresses or secrets.

## Sources

- [Apple window capture behavior](https://developer.apple.com/videos/play/wwdc2022/10155/)
- [FaceTime URL integration](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/FacetimeLinks/FacetimeLinks.html)
- [WebRTC peer connections](https://webrtc.org/getting-started/peer-connections)
- [Apple settings guidelines](https://developer.apple.com/design/human-interface-guidelines/settings)
- [Apple windows guidelines](https://developer.apple.com/design/human-interface-guidelines/windows)
- [Electron windows](https://www.electronjs.org/docs/latest/api/browser-window/)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Forge Webpack](https://www.electronforge.io/config/plugins/webpack)
- [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve)
- [Tailscale connection types](https://tailscale.com/docs/reference/connection-types)
- [Apple app approval](https://support.apple.com/en-gb/102445)

## 2026-10-15: user-requested setup and UI revisions

Host setup can now run fixed Tailscale commands after the user presses Host. Main opens only the known installed Tailscale application, uses execFile with fixed argument arrays/timeouts/output limits (no shell), derives/validates the actual hostname from status, checks HTTPS eligibility and Serve state, rechecks before changing its free8443 port, then verifies the owned result. Existing owned service is reused. Conflicting/old-hostname/Funnel/foreground services are refused. No automatic live tailnet changes occur during development tests or startup, no account grants/reset/Funnel commands exist, and no arbitrary command/URL bridge is exposed. Join opens/connects Tailscale but never runs Serve. First-time user sign-in, VPN approval and HTTPS/account-owner approval remain interactive. The old manual endpoint flow is kept under Advanced for already configured hosts.

System light/dark colors, familiar controls, focused call actions and a grouped modal Settings view apply Apple’s hierarchy and accessibility guidance within the existing single renderer. The menu offers Settings with Command-comma. No UI framework or dependency was added. Camera settings join geometry in the private atomic preferences file; old geometry-only files migrate with safe defaults. Pairing storage remains encrypted and separate.

## 2026-10-15: local device check

The user requested a local camera preview and live microphone listening. A DeviceCheck module in the existing renderer owns a temporary stream and Web Audio context, with a separate main-process120-second authorization lease. That lease cannot authorize call signaling and is denied while a call/call capture exists. Call initiation/incoming ringing, mini, settings close, reload, sleep and quit stop/revoke the check. Epoch guards discard late capture results; failed checks release tracks and permission. No peer connection, network transmission, recording, persisted monitoring choice or additional BrowserWindow is involved.

The microphone feeds an analyser then a gain node connected to the current output. Gain is initially zero: Chromium requires an active output path for reliable meter samples. Explicit listening changes gain to0.6; disabling it restores zero. Closing the check closes the audio context and stops all tracks. The preview is always muted and uses the existing mirror/quality preferences. Headphones avoid feedback during live listening. The main/renderer timers cap even a pending permission prompt at two minutes; macOS approval cannot be bypassed. Camera/microphone usage descriptions now include the explicit device-check purpose.


## 0.3.2 user-requested update checks

The user revised the original manual-only distribution scope and explicitly chose **verified download + guided installation**. Main owns the fixed public GitHub releases-list request, numeric version/architecture selection, bounded HTTPS download, digest verification and Finder reveal. No GitHub credentials, telemetry, arbitrary URL/path arguments, remote UI, new BrowserWindow or renderer network permission is introduced. Updates never install themselves or interrupt a call.

Use the releases list because GitHub's latest endpoint excludes prereleases; select the highest numeric vMAJOR.MINOR.PATCH among the100 most recently published entries, ignoring drafts. The current private candidates use GitHub's prerelease flag, which is shown before download. Reject downgrade/equal versions, missing/duplicate architecture assets, mismatched canonical publisher URL, missing SHA-256/invalid size, untrusted/non-HTTPS redirects and incomplete/changed bytes. Limits: metadata4MiB/15s, archive512MiB/10min,3 redirects, one check/download at a time. Fixed GitHub release CDN hosts are allowed with normal certificate validation. GitHub HTTPS metadata/digest verifies transport/integrity; it is not an independent publisher signature and a compromised release publisher remains a risk.

A unique private subfolder in Downloads prevents overwrites. A fixed main-owned JXA script calls Apple's Foundation quarantine-properties API before any bytes arrive, then reads back the quarantine attribute. Paths/URLs are passed as execFile arguments, never interpolated into script or shell code. Quarantine failure blocks installation readiness. Verify size/SHA-256 before renaming the .download file to ZIP, and recheck before Finder reveal. Failed/abandoned downloads stay isolated with .download suffix; no app files, profiles or prior downloads are deleted. Closing the app interrupts downloading; no resume service or persisted updater database.

Electron's built-in macOS updater requires consistent signing. Our ad-hoc build's designated requirement contains its exact cdhash, so a different build cannot satisfy that requirement. We do not disable signature validation or implement a privileged replacement helper. Finder/Archive Utility and the supported per-app macOS approval flow handle extraction/replacement; users end their call and quit first. Pairing/window settings remain outside the bundle, but ad-hoc signature changes may trigger Keychain/media approval. First-install/update approval on the partner's Mac remains a physical acceptance requirement.

Sources: [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater), [GitHub releases API](https://docs.github.com/en/rest/releases/releases), [Apple quarantine properties](https://developer.apple.com/documentation/foundation/urlresourcekey/quarantinepropertieskey). This is the sole update exception to the original exclusions: no automatic installation or background updater.


## 0.3.3 guest CLI compatibility fix —2026-10-16

Guest WSS pairing does not require a functioning Tailscale command-line interface. Both roles still explicitly open the installed app and attempt the existing bounded status/auto-connect path. If status is unavailable, non-JSON or structurally invalid, guests can import the captured clipboard invitation and use the authenticated verified-TLS socket as the signaling reachability check. They must connect Tailscale in its GUI when automation is unavailable. No successful network state is inferred from this fallback. Hosting remains strict because it needs CLI status and private Serve configuration. Known offline/sign-in states retain actionable failures; supported stopped sessions still use the existing fixed up command. Clipboard text is read before opening another app so async setup cannot replace the intended invitation with later clipboard contents. Secrets remain main-only and validation is unchanged.

The old main-process JSON.parse leaked a SyntaxError for text starting The Tailscale, before the already-redacted invitation parser ran. A shared tested connection helper now applies the role-specific requirement and a redacted host error. No CLI output, personal status/network details, invitation or credentials are printed. No system setting, TLS, tailnet permission, signaling schema, media or capture-policy change.

## 2026-10-16: Safari full-screen overlay candidate

The user reported that the actual Mini window disappeared over Safari full screen. The old normal-type BrowserWindow could report visible/always-on-top/all-workspaces while not appearing in the native on-screen window list alongside Safari. Raising it from floating to modal-panel or status, and explicitly setting accessory activation policy, did not resolve that observed probe. Do not equate Electron flags with physical overlay visibility.

The candidate uses Electron's documented `type: 'panel'` on the same persistent BrowserWindow. Its nonactivating native window behavior is designed for other apps' full-screen Spaces. An isolated panel probe appeared in the on-screen window list alongside Safari at ordinary floating level3; no focus timer, elevated screen-saver level, second window, renderer recreation or native addon is added. Panels default to floating, so startup explicitly restores normal window level; existing Mini transitions alone enable floating.

Tradeoff: Electron panels force all-Spaces membership even in normal mode. Normal mode is not always-on-top but can follow desktop changes. Its existing full-screen capability, Dock minimize, keyboard controls and geometry still require actual packaged regression checks; merely accepting setFullScreenable(true) is not proof of native full-screen success. Do not ship if those regress. The alternate modern AppKit collection behavior experiment is inconclusive because Safari was no longer on-screen; its ignored native prototype is not part of the app.

User requested continued code investigation while actively using Safari. No further Safari manipulation is authorized by that request. Controlled Safari enter/exit/video-full-screen/Space transitions and partner-Mac checks remain pending. This is a local candidate, not a verified or published fix.

Source: [Electron44.7.1 macOS panel contract](https://github.com/electron/electron/blob/v44.7.1/docs/api/structures/base-window-options.md#macos) and [panel implementation](https://github.com/electron/electron/blob/v44.7.1/shell/browser/ui/cocoa/electron_ns_panel.mm).

## 2026-10-16: independent always-on-top settings

User revision: both normal and Mini modes have separate persistent boolean choices. Defaults preserve regular=false/Mini=true, including migration from older or malformed preferences. The main process applies the active mode's choice at creation, every mode transition and each validated preferences update, using the existing floating level when enabled and normal level when disabled. Settings uses two labeled keyboard-accessible switches in the existing modal; changing the inactive mode's preference does not change the current mode's level. It never changes media, focus, native full-screen capability or workspace membership. Disabling topmost allows other windows to cover the app; it does not remove the panel's all-Spaces behavior. Settings persistence failures retain the existing visible warning.

The existing narrow preference bridge now validates all six fields, with exact keys and types; credentials and permission handling are unaffected. Window state includes a read-only native alwaysOnTop value so packaged checks can verify the actual OS-facing flag rather than merely echoing a preference. New focused tests cover all four combinations, malformed booleans, legacy migration and persistence. Packaged smoke now covers native flag changes, repeated mode transitions, renderer continuity and a Settings switch; that GUI run remains pending while Safari is in use.

## 2026-10-16: experimental speaker echo reduction

User requested an optional attempt to keep movie/computer playback out of the outgoing microphone while using speakers. Ordinary call echoCancellation/noiseSuppression/autoGainControl remain enabled regardless of this switch. The new persistent speakerEchoReduction boolean defaults false and migrates old settings without opting in.

Use the standard echoCancellation ideal "all" constraint when acquiring a microphone, with ordinary noise suppression/gain processing. This lets the bundled engine use its system-audio reference when supported, while a device lacking that optional mode can continue a normal call. Read the acquired track's actual getSettings().echoCancellation: only "all" is reported as applied; boolean true, remote-only or absent means unavailable for the experiment. Capability advertisement alone is insufficient. This is an attempt at cancellation, not a guarantee of silence or a speech/music classifier.

Apply the preference to the next call, explicit device reacquisition or local device check; the switch never starts capture or changes an active track. Snapshot the preference for each pending capture to keep asynchronous results consistent. Existing epoch guards, late-track stopping, mute preservation, permission leases and cleanup remain in charge. Device checks use the same constraints and status so the user can inspect the available mode before calling. No custom DSP, extra dependency, alternate media transport or system/Chrome flags are added.

User scope revision permits the engine's internal system-audio reference solely for the optional microphone cancellation. macOS may require system-audio consent, and refusal/unsupported behavior must never be bypassed. The packaged NSAudioCaptureUsageDescription explains this optional reference instead of inheriting Electron’s generic text. No additional entitlement is added. No JavaScript system-audio stream, screen capture, file recording, playback mixing or system-audio transmission is added. Only the processed microphone track is sent. Do not add entitlements, screen-capture permission handlers or force-enable browser features to make this work. Off means ordinary echo cancellation, not raw/unprocessed audio.

UI labels it Experimental and distinguishes enabled-for-next-session, standard, applied and unavailable. Both Macs should enable the option if both use speakers. Loud playback, room acoustics, routing and simultaneous speech can leave leakage or affect voice quality. Hardware acoustic efficacy, permissions, CPU and cross-application movie playback require physical tests; fake devices prove lifecycle/constraints, not sound removal.

Source: [W3C echo cancellation modes and ideal constraints](https://w3c.github.io/mediacapture-main/#dom-echocancellationmodeenum-all).

## 2026-10-16: user-initiated install and restart

The user revised the previous guided-Finder choice: future updates should replace the app without requiring them to delete/drag the old bundle. Download the published prebuilt ZIP; never compile source, clone a repository or require Node/Xcode on the recipient Mac. Flow remains explicit Check → Download → Install and restart, with prereleases labeled. No startup polling or installation during a call/check. This supersedes the earlier Finder-only restriction; first installation of this updater-enabled build still uses the old updater/Finder because previous binaries cannot gain new code retroactively.

Why a small helper: macOS cannot safely replace the running bundle before it quits. A headless child of the current packaged Electron executable reuses its bundled Node runtime; it creates no BrowserWindow, takes no single-instance lock, uses a separate temporary profile, and has no camera/call/network UI. It validates a private main-owned job, signals readiness, waits for the parent PID to exit, replaces the bundle and opens it through normal LaunchServices (`open -n`). It cannot install arbitrary paths, accept renderer-supplied releases, elevate privileges or bypass Gatekeeper. No new native helper/toolchain or update server is required. Main rechecks call/check state before quitting, rejects new capture during installation, and ends local app resources through the existing quit lifecycle.

Boundaries: main derives only /Applications/ZoomTime.app or this user's ~/Applications/ZoomTime.app from the running executable. Refuse development, Downloads, disk-image, translocated, symlinked, non-owned and non-writable installations. Verify the downloaded ZIP's GitHub SHA-256/size again, copy into a new owner-only update job, reverify, and quarantine it. Extract into a new hidden sibling directory so final moves stay on the same filesystem. A pinned pure-JavaScript yauzl3.4.0 reader is used instead of a handwritten ZIP parser or an unsupported native/internal extractor. It is the only new runtime dependency (plus its pend dependency); types are development-only.

ZIP guards: exactly the ZoomTime.app root; no traversal, absolute/control/backslash paths, case/Unicode duplicate names, encryption, special files, writes under symlinks or escaping/broken links. Maximum20,000 entries and2GiB expanded bytes. Stream regular files exclusively; create validated internal framework links last and resolve them within the app. Then verify exact bundle ID/executable/version, the agreed14.0 deployment floor, CPU architecture, deep/strict code signature and quarantine. These checks are repeated in the helper before the parent quits. Code signing proves integrity, not an independent publisher identity for ad-hoc builds; the existing verified GitHub release/HTTPS boundary remains the publisher trust root. A compromised publisher account is still a risk.

The private job contains only paths, versions, process/inode identity and public release metadata. It is under Application Support/ZoomTime-update-jobs, with owner-only directory/file permissions, strict job naming/schema/UUID/role-free identity and fixed target derivation. Helper binds the job to its actual parent PID, verifies current device/inode to avoid replacing a concurrently changed installation, rejects downgrade/invalid metadata, times out without changes if the parent does not exit, and keeps a small stage journal. Renderer gains only no-argument installUpdate; no shell, file path, arbitrary request or raw IPC bridge.

Replacement renames the old app to a unique visible ZoomTime-previous-VERSION-UUID.app backup, moves the staged app into its original path, and reopens through LaunchServices. If placement/open returns an error, move the candidate back and restore the previous bundle; the helper attempts reopening the old app and reports the result on normal startup. No existing bundle, backup, user profile, archive or failed staging directory is deleted. These are two checked renames, not an atomic directory exchange: a crash/power loss between them can require manually restoring the preserved backup in Finder. Backups/download jobs consume disk space and are retained until the user elects to remove them.

Quarantine is set on the download and staged app and never removed. No Squirrel signature requirement is disabled; Electron's built-in updater is not used because ad-hoc signatures change between builds. Normal Gatekeeper and Keychain prompts can still require a local user action. LaunchServices returning success is not proof that Gatekeeper approved or the new app stayed healthy; no silent approval, automatic trust exception or guaranteed unattended restart is claimed. A per-app approval/real upgrade on both Macs remains a physical gate.

Sources: [Electron automatic updater signing requirement](https://www.electronjs.org/docs/latest/api/auto-updater#macos), [yauzl ZIP reader and validation](https://github.com/thejoshwolfe/yauzl).
