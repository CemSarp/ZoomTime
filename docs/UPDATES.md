# Update ZoomTime

The current prerelease is [v0.3.4](https://github.com/CemSarp/ZoomTime/releases/tag/v0.3.4). Download the app ZIP for your Mac, not GitHub's source archive.

## First upgrade to the new installer

On 0.3.2/0.3.3, use Check for Updates → Download update → Show verified download in Finder. End your call, quit ZoomTime, extract the ZIP and drag ZoomTime.app into Applications, choosing Replace. No manual deletion or pairing reset is required. Version 0.2.0 needs a direct download. Earlier local 0.3.4 previews must also install this release manually because equal-version updates are not offered.

## Future updates from 0.3.4

1. Open **ZoomTime → Check for Updates…**, or **Settings → App updates → Check for updates**.
2. Review the newer version and prerelease label, then choose **Download update**. The app selects the Apple Silicon ZIP (Intel/Rosetta support is retired) and verifies size and SHA-256 against GitHub release metadata.
3. End your call and stop any camera/microphone check. Choose **Install and restart**. No source compilation or development tools are needed.
4. ZoomTime verifies the staged app's bundle identity, version, architecture and code signature, waits for the current app to quit, preserves it as a `ZoomTime-previous-…` backup, replaces it and requests reopening through macOS. Pairing and settings remain outside the bundle.
5. Complete normal macOS/Keychain/media approval if requested. Use [Apple's supported per-app flow](https://support.apple.com/en-gb/102445) only for the trusted build. Never disable Gatekeeper or remove quarantine.

Install ZoomTime in `/Applications` or your own `~/Applications`. The app must be owned by you and its containing folder writable. No administrator helper is installed. If installation cannot proceed, use **Show verified download in Finder** and finish replacement after quitting. Actual installed-app replacement/restart and Gatekeeper approval remain pending acceptance tests for this prerelease.

Checks/downloads happen only when requested and can run during a call; installation waits until idle. Nothing changes in Tailscale. The old app, download and staging files are retained and consume disk space. If placement or reopening fails, the helper attempts to restore the previous app. A crash/power loss between the two renames can require manually restoring the retained backup in Finder; a successful macOS open request does not guarantee a healthy approved launch.

**No newer published build:** your installed version is equal to or ahead of GitHub. The updater never downgrades it. Local builds become available to your partner only after the publisher uploads a newer release.

**Network/rate limit/disk/Downloads access error:** correct that problem, then Check again. Failed or interrupted files have a `.download` suffix in a separate folder; do not open them. You may remove those failed-download folders yourself. Closing the app stops a download; retries start fresh. A completed ZIP stays in Downloads even after quitting.

**Checksum/security metadata error:** the app refuses to offer that file. Check again and retry; report a repeated failure. Checksums come from the same HTTPS GitHub release as the archive, so trust in the publisher/GitHub remains necessary. They do not create a notarized publisher identity.

For maintainers: publish numeric tags such as `v0.3.4`, with an uploaded Apple Silicon asset named `ZoomTime-darwin-arm64-VERSION.zip`. Intel assets from old releases are retained as history; future source rejects Intel update selection. GitHub must provide a `sha256:` asset digest. Upload the arm64 build before publishing the release; drafts are ignored. Prerelease flags are supported; `-beta` tag suffixes are not. The check selects the highest numeric version among the100 most recent releases. Keep prerelease status until physical acceptance evidence exists. Publishing needs a separate explicit request.
