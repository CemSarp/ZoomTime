# Update ZoomTime

Release builds are produced on the publisher's Mac and published to GitHub; your Mac never downloads source or needs a compiler. The current prerelease is [v0.5.0](https://github.com/CemSarp/ZoomTime/releases/tag/v0.5.0), the first persistent-signed migration release, with native incremental updates for subsequent compatible releases. This migration is a full download; no delta from older ad-hoc releases is advertised. The screen-capture permission bug remains unresolved.

## Migration to 0.5.0

The updater inside an old app cannot be changed remotely. A standard 0.3.4/0.4.0 installation uses its existing Check → Download → Install and restart workflow once, to migrate to0.5.0. Older builds, and Experimental previews whose old updater rejects the renamed path, may require one last Finder replacement. Preserve the previous app. Never reset pairing, privacy permissions, Keychain or system trust as part of an upgrade.

This migration replaces ad-hoc signing with one persistent, private self-signed certificate. Normal Gatekeeper, Keychain, camera, microphone or Screen Recording approvals may occur once. Self-signing does **not** give Apple-trusted distribution or guarantee prompt-free updates. Two subsequent normally launched updates on two actual Macs must establish permission continuity before that problem can be marked resolved. Follow [Apple's per-app approval guidance](https://support.apple.com/en-gb/102445) for a trusted build; never disable security protections.

## After migration

1. In Settings → App updates, choose **Check for updates**. This only discovers releases; it does not download or stage anything.
2. Review the version and prerelease label, then choose **Update ZoomTime**. This explicitly authorizes download, verification and preparation. A prepared update installs when ZoomTime next closes.
3. Finish all calls, hosted group sessions, device checks and local screen capture. Choose **Restart to update** to apply it immediately. A host that has left media may still be coordinating a group, so its restart remains blocked.

Keep the app directly in `/Applications` or your own `~/Applications`, named `ZoomTime.app` or `ZoomTime Experimental.app`. Nested folders, including `~/Applications/ZoomTime Testing`, can run the app but are not supported by the in-app installer. The bundle must be owned by you, with a writable containing folder. Native installation preserves the selected name/path. No routine Finder replacement or background update check is involved. Your encrypted pairing and settings stay outside the bundle. An ordinary user-initiated quit also installs an already prepared update, as explained before Update is selected.

When a patch from your exact signed version exists, the app normally transfers only that patch. A missing, inapplicable or corrupted patch falls back automatically to the full verified ZIP. Updates that change Electron itself can be much larger. Each prepared update keeps a verified previous bundle under your profile's `updates/backup-VERSION-…` directory. Downloads and backups are retained and use disk space; the updater never deletes them automatically. **Show recovery backup** is offered after an error when that backup is available. Interrupted staging leaves the working app in place; native installation recovery and a retained backup cover installation failures, but a successful open request alone does not establish a healthy user-approved launch.

**No newer published build:** versions are numeric, no downgrades/equal-version replacement. Unpublished local changes cannot be fetched by other Macs.

**Transfer, disk, permissions or signature error:** the app fails closed and preserves the current app/backup. Correct the problem and check again. Do not run incomplete downloads. A failed full verification cannot become a ready update. A native error may require restarting the unchanged app before another attempt. No administrator helper, custom trust exemption or certificate rotation is silently introduced.

## Maintainer workflow

Read the repository instructions and [implementation ledger](superpowers/plans/2026-10-18-incremental-updater.md). Use Node24.12+ on Apple Silicon/macOS14+:

```sh
npm run setup:signing
npm run test:signing
npm run setup:delta-tool
npm test
npm run typecheck
npm run lint
npm run make:arm64
npm run test:packaged
npm run test:media
npm run test:native-update
npm run make:update
# For a subsequent release, supply the exact preserved prior signed bundle:
node scripts/make-update.mjs out/ZoomTime-darwin-arm64/ZoomTime.app /absolute/path/to/previous/ZoomTime.app
```

Signing setup is explicit and developer-only. It stores the persistent key in the login Keychain, with encrypted PEM/PKCS12 recovery material in `~/Library/Application Support/ZoomTime Developer Signing` (owner-only). The recovery secret is a separate Keychain item, service `com.cemsarp.zoomtime.release-signing`, account `recovery-password`. Keep a secure encrypted off-device copy of both the recovery material and its secret. Source contains only the public DER certificate and SHA-1/SHA-256 pins. Never regenerate or rotate a lost identity silently: old native clients reject another certificate. No trust settings are changed. Self-signed identities need not appear in `security find-identity -v` as Apple-trusted identities; explicit fingerprint signing and pinned verification are the relevant checks.

Forge signs executable components consistently, keeps the native capture helper's explicit ID and certificate requirement, and verifies the app/helper after packaging. Resources are sealed by their containing bundle rather than individually signed into extended attributes. Permissions are normalized before signing. Keep fuses, ASAR integrity, entitlements, sandbox/isolation and verified TLS intact.

`setup:delta-tool` verifies the official Sparkle2.9.5 build archive against its pinned byte count and SHA-256. BinaryDelta is a **build tool only**, not shipped. `make:update` preserves an exact signed bundle in a fresh `out/incremental-releases/VERSION-…` directory, creates the full ZIP, and optionally creates/applies a version4 LZMA delta. Both the reconstructed signature and complete file/path/mode digest must match. A delta is advertised only when smaller than the ZIP. The first persistent-identity release has no compatible prior base, so it ships a full ZIP only.

Publish only after a separate request and applicable checks. Commit intended source and rebuild with clean-source provenance before publication; local dirty-tree candidates are not publication artifacts. Upload **all** assets before publishing a numeric `vVERSION` prerelease: `ZoomTime-darwin-arm64-VERSION.zip`, optional `ZoomTime-darwin-arm64-BASE-to-VERSION.delta`, `ZoomTime-native-arm64-VERSION.json`, its `.json.sig` signature, `SHA256SUMS`, and `build-manifest.json`. GitHub must expose uploaded sizes and `sha256:` digests. Native clients select the highest numeric version in the100 most recent releases and require the versioned feed too. Missing deltas use full fallback; missing/invalid feeds reject the incomplete release. Historical releases remain untouched.

The main process validates the feed against GitHub metadata and serves it through a nonce-protected ephemeral loopback broker. Every remote byte still passes the existing HTTPS publisher/CDN allowlist, byte bounds, hash verification and download quarantine before reaching Electron's updater. Electron/Squirrel reconstructs and verifies the new app against the running app's certificate-pinned requirement, stages and installs it. Native implementation details, including its own temporary-file and quarantine handling, belong to the bundled updater; ZoomTime adds no security-bypass flags or removal commands. [Electron's updater contract](https://www.electronjs.org/docs/latest/api/auto-updater) describes delta fallback and installation on quit. SHA-256 metadata shares the GitHub publisher trust boundary; the persistent signing pin is the independent app-identity boundary.

The versioned feed also has a detached `ZoomTime-native-arm64-VERSION.json.sig` signature made with the persistent certificate. Verify it before parsing/routing native transfers. This binds target version and full/delta hashes independently of GitHub metadata and prevents substituting a patch that reconstructs a different previously signed version. Forge enables `ElectronSquirrelPreventDowngrades` as an additional native guard. The producer verifies reconstruction and actual target bundle version before signing the feed. Upload the signature asset with the feed before publication.
