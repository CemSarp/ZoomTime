# ZoomTime group calling design

Approved by the user on 2026-10-17. This explicitly revises the two-person contract. Implementation is source-only: no new application/helper builds, installation, publication, live tailnet changes, invitation delivery or file deletion. Existing artifacts remain historical.

## Goal and architecture

One private group, one signaling host, five named members including the host, one active call, and one calling engine for 2–5 participants. Anyone selects named recipients and calls; joined members can invite other registered members. Every recipient explicitly accepts. Leaving removes only local participation while at least two people remain. The host can leave media while keeping its application/coordinator running. Host quit/sleep or prolonged signaling loss ends the call; no failover.

Full-mesh standard encrypted WebRTC, `iceServers: []`, one shared local capture stream and at most four peer connections per renderer. Five participants create ten bidirectional links. No SFU, media forwarding/mixing, STUN/TURN, new hosting, framework, runtime dependency, screen transmission or duplicated two-person engine. Preserve arm64/macOS14+, sandbox/isolation/TLS/Gatekeeper, one BrowserWindow, permissions, updater and native local capture boundaries.

## Identity, storage and public interfaces

- Stable UUID participant/group IDs; host authority is independent of media membership. Host assigns names (trimmed, 1–40 characters, unique case-insensitively, no controls). Render names as text.
- Each guest has its own random canonical 32-byte bearer credential. Only main owns secrets. Host adds/renames/revokes members; anyone joined can invite registered online members to a call. Invitation copying is explicit and member-specific.
- safeStorage persists the directory atomically; persist before publishing credentials or changing live authentication. Legacy ciphertext gets an exclusive owner-only backup before migration. Preserve both existing credentials. Legacy guests learn their group/self IDs from the authenticated upgraded host and persist them.
- Protocol v2 only; accept v1 pairing data, not v1 calls. Require everyone to update, with actionable incompatibility errors. No plaintext fallback.
- Sanitized state: self/host/group IDs, member directory/presence, local call/invitation, network/error, group-busy indication. An uninvolved member never receives another call's signaling.
- Call snapshot: server call ID, initiator, membership/media states, current invitations, peer-pair snapshots. Caller/inviter IDs retain historical identity after revocation; only current directory and pair membership confer access. Pair: UUID ID, endpoint IDs, lower-UUID offerer, positive negotiation generation and phase. Server derives sender from authentication, checks pair membership and forwards only to the other endpoint.
- Narrow bridge gains member add/rename/revoke and member-specific invitation copy. Capture authorization binds a local operation UUID to explicit targets or current call/invitation. Renderer never receives invitation text/credentials or generic OS/network capabilities.

## Coordinator lifecycle

- A request has an operation UUID and explicit distinct online targets excluding self. Invalid/offline targets reject the whole request. Matching simultaneous participant sets converge; different requests are busy.
- Caller joins explicitly after capture. Others receive individual UUID invitations expiring after60s. Accept requires the current invitation and operation UUID. Reject/expiry affect only that member. A new invitation permits rejoining after leave/reject/expiry.
- Joined pairs alone negotiate; adding/removing a member never recreates healthy other pairs. An initial caller waits until all invitations expire/reject; once two people have joined, dropping below two ends the call and releases the last user's devices.
- Per-pair 30s initial connection; 5s outage debounce, one ICE restart per outage,30s recovery. Preserve stale-call/pair/generation guards and bounded ICE queues. Failed pairs stay visibly degraded while healthy links continue; a two-person call with no working link ends.
- Guest signaling loss has30s bounded recovery, then only that membership expires. Host signaling loss expires the entire call. Reconnect retains identities and working media; departed membership cannot resume from an old snapshot.
- Capture acknowledgement30s, pending permission/camera/device acquisition60s. Stop late captures. Device check remains a separate120s lease and cannot authorize a call. Uninvolved members may check devices; only an addressed incoming call stops their check.
- Heartbeat20s/two missed replies,64KiB message max, compression off, loopback127.0.0.1:47831, private verified WSS ts.net:8443/zoomtime. Control100/10s, negotiation100/10s per authorized pair, aggregate500/10s per authenticated participant; limits survive reconnect.
- Host Leave is not shutdown. Retry cannot replace a coordinator serving an active call. Installation is blocked whenever this host coordinates an active call, even with no local media. Host reset revokes everyone; guest reset leaves locally. Host sleep/quit/reset stops the room. No automatic capture on wake.

## Media and presentation

`MediaCall` owns local tracks and member-indexed `MediaPeer`s. `MediaPeer` owns one RTCPeerConnection, negotiation queue, ICE, generation, stats and timers; closing it never stops shared tracks. Offerer alone creates transceivers; answerer reuses them. Camera off stops the one capture track and clears every sender. Reacquisition occurs once; muted replacements are disabled before attaching to any sender. Isolate sender replacement failures. Preserve720p default and existing360p/720p/1080p preferences and local-only mirror.

One persistent remote video/audio playback path per remote member. Stable order: one full tile, two columns, three/four a2×2 grid. Same elements across normal/Mini, resize and pin/unpin. Pin never interrupts other audio. Show camera-off/stale/reconnecting/failed separately; local optional muted self-preview retains its settings. Preserve900×600 normal/min640×420,320×180 Mini/min160×90 and keyboard/hover controls. Extra participant controls use an accessible compact menu.

Named recipient selection and selected names on Call; incoming initiator and participants; in-call invitations; named membership/status. Speaker statistics every500ms: highest eligible level>0.02 over two samples; clear after1s silence. No reorder; no highlight for missing data, muted/stale/disconnected participants. Local-only, no recording/analytics. Pin/hidden tiles cannot manufacture an outage from DOM visibility alone. Screen transmission and its layout are deferred without placeholder controls.

## Ownership map

Protocol/pairing: src/protocol.ts, src/pairing.ts. Authority/transport: src/coordinator.ts, src/signaling.ts, src/signaling-client.ts. Browser-safe contracts: src/calling-state.ts. Permissions/lifecycle: src/calling-service.ts, src/main.ts, src/bridge.ts, src/preload.ts. Media: src/media-call.ts and new src/media-peer.ts. UI: src/call-view.ts, src/renderer.ts, src/index.html, src/index.css. Extend existing node tests and real-browser/generated-media/package harnesses; no separate app engine.

## Evidence and acceptance

Source checks: npm test; npm run typecheck; npm run lint; git diff --check. Future explicitly authorized build/test stage: npm run test:media; npm run make:arm64; npm run test:packaged. Do not test changed source against stale packaged binaries.

Require actual2–5 Macs, guest-to-guest links, pairwise routes, real devices, invitations/leaving/host failure, full-screen Mini, downloaded install/migration,60-minute then3-hour group call with measured CPU/memory/bandwidth/thermals. Local generated media is not physical evidence. Separate Tailscale identities and grants must allow all participating pairs; host-only device sharing is insufficient. No live grants/settings changes automatically.

Sources: https://www.w3.org/TR/webrtc/ ; https://www.w3.org/TR/webrtc-stats/ ; https://tailscale.com/docs/reference/inviting-vs-sharing .
