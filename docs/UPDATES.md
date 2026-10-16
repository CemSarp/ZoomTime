# Update ZoomTime

Install the matching ZIP from [GitHub v0.3.3](https://github.com/CemSarp/ZoomTime/releases/tag/v0.3.3) once to get these controls. If already on0.3.2, Check for Updates downloads0.3.3 directly. Version0.2.0 has no updater. Future local builds become available only after an explicit publication.

1. Open **ZoomTime → Check for Updates…** in the Mac menu bar, or **Settings… → App updates → Check for updates**.
2. If a newer build is published, review its version and **prerelease** label. Press **Download update**. The right Apple Silicon/Intel ZIP is selected for the running app. A prerelease is a test candidate; the two-Mac/long-session checks still apply.
3. Wait for **Download verified**. The app checks the ZIP's size and SHA-256 against GitHub's metadata. A failed check never offers installation.
4. Choose **Show verified download in Finder**. Your ZIP is in a separate `ZoomTime-update-…` folder inside Downloads.
5. End your call and **Quit ZoomTime (⌘Q)**. Double-click the ZIP to extract it. Drag the extracted **ZoomTime.app** into **Applications**, and choose **Replace**. Keep the previous trusted ZIP in case you need to reinstall it.
6. Open ZoomTime from Applications. Pairing and settings stay on this Mac. Updates may prompt for Keychain/camera/microphone or [Apple's per-app approval](https://support.apple.com/en-gb/102445). Approve only the trusted build. Never disable Gatekeeper or remove quarantine to make it open.

The download does not replace or restart your running app. A check can run during a call; quit only when you are ready to finish installation. No checks/downloads happen at startup. Installation needs no Node, Xcode, GitHub account/token, new calling service or payment. Nothing changes in Tailscale.

**No newer published build:** your installed version is equal to or ahead of GitHub. The updater never downgrades it. Local builds become available to your partner only after the publisher uploads a newer release.

**Network/rate limit/disk/Downloads access error:** correct that problem, then Check again. Failed or interrupted files have a `.download` suffix in a separate folder; do not open them. You may remove those failed-download folders yourself. Closing the app stops a download; retries start fresh. A completed ZIP stays in Downloads even after quitting.

**Checksum/security metadata error:** the app refuses to offer that file. Check again and retry; report a repeated failure. Checksums come from the same HTTPS GitHub release as the archive, so trust in the publisher/GitHub remains necessary. They do not create a notarized publisher identity.

For maintainers: publish numeric tags such as `v0.3.4`, with exactly `ZoomTime-darwin-arm64-0.3.4.zip` and `ZoomTime-darwin-x64-0.3.4.zip` as uploaded release assets. GitHub must provide a `sha256:` asset digest. Upload both builds before publishing the release; drafts are ignored. Prerelease flags are supported; `-beta` tag suffixes are not. The check selects the highest numeric version among the100 most recent releases. Keep prerelease status until physical acceptance evidence exists. Publishing needs a separate explicit request.
