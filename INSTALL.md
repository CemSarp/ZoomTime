# Install or update ZoomTime 0.4.0 (prerelease)

Requires an Apple Silicon Mac (M1 or newer), native arm64 execution, and macOS14+. Intel/Rosetta is unsupported; historical downloads are retained.

## Update from inside ZoomTime

1. Open Settings and choose **Check for updates**. The0.4.0 prerelease should appear on supported Macs.
2. Choose **Download update** and wait for verification. The app checks the GitHub asset’s size and SHA-256 and retains macOS quarantine.
3. Finish calls, device checks and local screen capture. A host coordinating other participants must wait for the entire call to end.
4. On0.3.4, choose **Install and restart**. The previous app is kept as a backup; pairing/preferences remain in your profile. Allow normal macOS/Keychain prompts.
5. On0.3.2/0.3.3, use the verified Finder download: quit ZoomTime, extract the ZIP, and replace ZoomTime.app in Applications. On0.2.0, use the direct ZIP below.

All participants must upgrade together.0.4.0 uses a new group-call protocol; an older running app cannot join. Legacy encrypted pairing data migrates with original-ciphertext backups; do not reset pairing just to update.

## First installation

1. Download [ZoomTime-darwin-arm64-0.4.0.zip](https://github.com/CemSarp/ZoomTime/releases/download/v0.4.0/ZoomTime-darwin-arm64-0.4.0.zip).
2. Extract it and move ZoomTime.app to /Applications or your own ~/Applications. No Node, Xcode or GitHub account is required.
3. Open ZoomTime. This private build is ad-hoc signed and unnotarized; use the supported per-app approval in macOS Privacy & Security if prompted. Do not disable Gatekeeper or remove quarantine.
4. Each person installs Tailscale using their own identity. Permit connectivity between every participating Mac, not just to the host. The host adds named members and explicitly shares each person’s own secret invitation privately.
5. Select names and Call; each invited person accepts. Keep the host app open even if its user leaves the conversation.

## Known permission bug and test status

**The screen-share/screen-capture Screen Recording permission bug remains unresolved.** macOS can repeatedly ask for access or refuse capture after it is enabled. Use Settings → Screen Recording settings to check this exact app, then quit and reopen from Applications; this is recovery guidance, not a guaranteed fix. Screen capture currently produces local diagnostics only. Partner screen transmission and protected-video capture are not implemented. Camera/microphone calls have separate permissions.

Real multi-Mac/network, hardware/full-screen, downloaded installed-update/migration and long-session group performance remain pending. This is a prerelease. If an update cannot reopen, retain and restore its ZoomTime-previous backup through Finder and normal macOS approval. Do not delete unrelated apps/profiles or loosen system security.
