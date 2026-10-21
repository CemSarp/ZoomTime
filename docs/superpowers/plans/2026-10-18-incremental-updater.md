# Free incremental updater implementation ledger

Spec: ../specs/2026-10-18-incremental-updater-design.md. Execute sequentially inline with superpowers:executing-plans and TDD. Keep keys/backups outside tracked source and no publication/installed-app replacement. Never delete unrelated artifacts or modify OS trust/privacy settings.

- [x] Task1: persistent signing bootstrap, public pin policy, two distinct fixture identity verification. Stop adoption if this gate fails.
- [x] Task2: pinned BinaryDelta release producer, exact signed bundle preservation, patch reconstruction verification and native feeds/checksums/provenance.
- [x] Task3: main-owned native updater integration with existing strict transport/validation, explicit Check/Update/Restart, legacy migration receipt support, standard/Experimental paths and backups.
- [x] Task4:0.5.0 candidate, UI and docs/migration/manual acceptance evidence.
- [x] Task5: software verification and one independent review executed; source/media/native/fallback/security and packaged UI subset pass. Full packaged host gate and physical evidence explicitly pending at user request; no acceptance claim.

## Rulings and evidence

- Baseline: codex/screen-capture at000b65b, clean tree, published0.4.0. Existing node_modules available; no dependency installation or branch switch needed.
- Ruling: continue in the existing feature checkout used by this task; preserve previous build outputs and installed bundles. Track progress here rather than deleting skill scratch workspaces.
- Preflight: Task1 pins are consumed by build/helper/runtime verification; Task2 feeds by native transport; Task3 native staging must not bypass existing URL/hash/byte limits, idle guards or rollback. User chose automatic full fallback and one migration approval.

## Execution results (local candidate, not published)

- Task1: public policy/pins, scoped login-Keychain identity and encrypted recovery backup created. Two distinct real signed fixtures satisfy identical pinned requirements; wrong/ad-hoc signer rejected. `test:signing` evidence under out/verification/signing-*. No trust setting changed.
- Task2: official Sparkle2.9.5 archive hash/size verified. Release producer preserves signed bundles, generates format4 LZMA, reconstructs and compares path/mode/file digest plus signatures, emits versioned feed/provenance/portable checksums. Smaller delta only;0.5.0 uses full-only migration.
- Task3: native controller/main/UI plus private nonce broker retain exact publisher HTTPS/size/hash/quarantine checks, full ZIP bounded extraction/pin validation, backups, both installation names, explicit staging and activity guards. Focused controller/feed/signing/release tests observed RED→GREEN. Source suite initially134/134; later additions await final run.
- Task4: version0.5.0 and current update/migration/architecture guidance written; historical releases untouched. Candidate unsigned/ad-hoc fallback disabled. Screen permission issue explicitly pending.
- Task5 in progress: real signed native A→B→C passed standard and Experimental paths; delta41770bytes vs127335475-byte ZIP, corrupt delta automatically full-fallback. Wrong signing identity, corrupted full, cancelled transfer and unwritable directory preserve installed fixture and backup. Fresh generated-media suite passes. Package check reached host creation but user's real process owns47831; request pending, app untouched. Final source/package/release checks and independent review ongoing.
- Ruling: use a main-process nonce broker — native downloads alone would bypass the existing strict publisher/quarantine/hash policy — cost if wrong: extra loopback transfer/cache and a staging failure, never remote URL bypass.
- Ruling: sign Mach-O executables and bundles, seal resources in their bundles — osx-sign otherwise writes code-signing xattrs on binary resources that BinaryDelta refuses — cost if wrong: strict bundle/delta verification rejects the release. No post-sign removal command added.
- Ruling: preserve historical outputs/failure logs, no deletion or installed-app replacement — user's retained-history restriction takes priority over scratch cleanup.
- Ruling: isolate native Foundation/ShipIt caches with CFFIXED_USER_HOME in fixture launches; first native proof created a new shared ShipIt cache under the app ID before this isolation was added. No installed bundle or real pairing/settings profile was replaced/read by those fixtures; retain the cache as evidence, no deletion.
- Initial parallel packager runs shared a temporary staging root and one build failed. Run actual Forge packaging sequentially with fixture packaging; retained failure log, fresh final build passes. This is tooling evidence, not a green first run.

## Independent final review and fix pass

One fresh read-only review (gpt-6-astra, high) found one Important issue, no Critical/Minor: native delta signature verification alone does not bind the reconstructed app to the advertised version. Fixed with certificate-pinned detached feed signatures over the exact target and asset hashes, required metadata signature asset, and native ElectronSquirrelPreventDowngrades. Producer validates actual bundle version/reconstruction before signing. Focused detached-signature test observed RED (missing verifier)→GREEN, including altered bytes and wrong pin rejection; final suite138/138 passes. Reverse/equal replay fixtures and final signed build rerun pending at this ledger update. Wrong-signer negative fixture corrected to use valid ZoomTime.app root and signature-specific precondition.

- Final: Ruling: trust a feed signed by the same persistent publisher certificate to bind target version and delta hash, plus native downgrade guard — bundled native verification alone lacks exact target-version binding; no extra runtime framework/key or private-key export is introduced — cost if wrong: reject a future feed rather than install an unsigned mapping.
- Final: Ruling: reviewer declined physical permission/normal downloaded approval/interrupted native placement judgment — keep all three pending in acceptance; no stable-release or permission-fixed claim — cost if wrong: a physical rollout issue remains until those actual tests run.
- User explicitly chose leaving the real host running. Full packaged host/reset checks remain pending; do not stop it or treat the first failed check as a pass.

## Final result

138/138 tests, typecheck/lint/diff/syntax checks pass. Fresh signed arm64 build passes app/helper pin, metadata/fuses and five compiled-asset comparisons. Full0.5.0 candidate and certificate-signed feed generated in out/incremental-releases/0.5.0-P2nkQy; exact extracted tree verified. Native final Standard and Experimental sequences and reverse/equal/signer/corruption/cancellation/unwritable negatives pass. Final source remains uncommitted/unpublished; no installed app replaced.

- Final: fixed delta target binding — detached data verifier RED→GREEN (including actual altered bytes/wrong pin), reverse/equal valid signed-tree patch substitutions rejected before transfer; suite138/138 and native final logs pass. Trusted producer binds actual reconstructed target to signed feed. Native downgrade flag also enabled.
- Final: fixed wrong-signer negative fixture — valid ZoomTime.app ZIP root/extraction/strict structural check precedes actual pin-rejection assertion; final native negatives pass.
- Final: Ruling: add a one-second test-only settle between repeated native Spaces animations — did-leave-full-screen can precede completion of the Space animation, and immediate second entry timed out twice. No production timeout/window code changed;24 non-host groups now pass per Mini size — cost if wrong: this packaged test misses rapid full-screen re-entry, retained as physical pending.
- Final: no Minor findings deferred. Do not dispatch a second review; the one fix pass has focused and full-suite/native evidence.

Pending: host/member/safeStorage/retry/reset packaged groups because the user elected to keep the real host running; two-Mac normal downloaded migration/permissions; interrupted native placement/recovery; physical mesh/hardware/long sessions; known screen permission bug. All retained artifacts/profiles/private backups remain; no scratch deletion, merge, push, publication or installed replacement performed.
