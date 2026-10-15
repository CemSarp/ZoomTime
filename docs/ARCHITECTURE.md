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
| Explicit Call/Accept before camera/mic access | Opening the app must not start capture. Camera off stops/releases its track; mute disables transmitted audio. |
| Prefer 720p/30 fps, with selectable 360p/24 or1080p/30; normal speech processing | User revision2026-10-15 requests improved detail and quality controls. Ideal constraints allow hardware fallback; applyConstraints updates a live track without replacing the peer. No fixed bitrate/codec is forced; WebRTC adapts to congestion. |
| System-default devices initially | Avoid a device-management subsystem; support explicit reacquisition after disappearance. |
| Settings and pairing only; no database/history/analytics/recording | Retain only what this private app needs. |
| Unnotarized Mac packages; GitHub prerelease downloads; manual updates | No paid Apple membership or update server; expect per-app trust/Keychain/permission prompts. The user requested GitHub downloads on2026-10-14; the existing public repository is reused. |

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

No group calls, chat, accounts database, recording, screen capture, analytics, movie streaming, playback synchronization, mobile apps, contact discovery, public deployment, hosted STUN/TURN, custom codecs/cryptography, or automatic updates.

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
