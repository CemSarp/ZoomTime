# Install or update ZoomTime0.5.0 (prerelease)

Requires Apple Silicon (arm64), macOS14+. Intel/Rosetta is unsupported; historical releases remain available. Download [ZoomTime-darwin-arm64-0.5.0.zip](https://github.com/CemSarp/ZoomTime/releases/download/v0.5.0/ZoomTime-darwin-arm64-0.5.0.zip). Recipients need no compiler, Node, Xcode or GitHub account.

## Migrate from an older release

1. In0.3.4/0.4.0, open Settings → Check for updates → Download update. The app verifies GitHub size/SHA-256 and keeps macOS quarantine.
2. Finish calls, hosted groups, device checks and local capture, then choose Install and restart. The old bundle is preserved; encrypted pairing/settings remain outside the app. Older installers or renamed Experimental previews may need one final Finder replacement from the verified ZIP. Keep the previous app.
3. This first persistent-signing migration is a full download. Normal Gatekeeper, Keychain and media approvals may occur. Do not reset pairing, TCC or trust settings. This private self-signed build is not Apple-notarized; use normal per-app approval when appropriate, never disable Gatekeeper or remove quarantine.

## First installation and later updates

Extract the ZIP and put **ZoomTime.app** directly in `/Applications` or `~/Applications`, then open normally. **ZoomTime Experimental.app** is also supported directly in those folders. The app/folder must be user-owned/writable. Nested folders (including `~/Applications/ZoomTime Testing`) can run the app but are not accepted for in-app installation. No path/security exception is added automatically.

After migration: **Check for updates** only discovers. **Update ZoomTime** explicitly authorizes download/verification/staging and installation when the app next quits. **Restart to update** applies immediately only when local/hosted calls, device checks and screen capture are idle. A previous signed bundle is kept as a recovery backup. Subsequent compatible releases can transfer signed deltas; missing/inapplicable/corrupt deltas fall back to a full verified download.0.5.0 has no compatible earlier signed release, so this release contains no delta. No background checks or updates.

Install the current version on all participating Macs. Each person uses their own Tailscale identity and every pair needs connectivity. Host adds named members and shares each person's own secret invitation privately; guests paste only their invitation. Keep the signaling host app open if the host leaves media. Existing encrypted pairings migrate with original-ciphertext backups; do not reset pairing just to upgrade.

## Features and limitations

Use **•••** for saved overall and participation-scoped per-person playback volume. Microphone/camera controls use accessible symbols in Normal/Mini. **Reduce speaker echo** switches during a call/device check without rejoining; a microphone swap may briefly pause outgoing voice. Its collapsed explanation describes WebRTC processing and variable acoustic results.

**Known screen-share/screen-capture permission bug remains unresolved.** Screen Recording can repeatedly prompt or remain denied after permission is enabled. Settings offers recovery guidance for this copy; it is not a guaranteed fix. Partner screen transmission and protected-video capture are not implemented. Screen diagnostics save local output only after an explicit Start.

Actual two-Mac permission continuity, downloaded installation/recovery, acoustics, every real group/network route, Safari/rapid Spaces/Dock behavior and long-session resource tests remain pending. Self-signing does not guarantee prompt-free updates. Preserve working bundles/profiles and use supported macOS approvals. [Update guide](docs/UPDATES.md) · [Acceptance](docs/ACCEPTANCE.md).
