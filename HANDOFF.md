# ZoomTime handoff

Updated 2026-10-13. Scope: phases 0–1 of the approved plan.

## Status

- Architecture and iterative guide recorded. The folder was empty and not a Git repository at start.
- Maintained Forge 8 Webpack/TypeScript scaffold; Electron 44.7.1 selected from npm metadata.
- One secure BrowserWindow/persistent renderer, normal/mini resizing, floating/workspace APIs, independent remembered geometry, display recovery, synthetic animation and accessible restore/close implemented.
- arm64 and x64 private packages built. No camera/mic acquisition, calling, or pairing in this build.
- **Phase 1 physical gate pending on both actual Macs. No calling/signaling has been implemented.**

## Evidence

Local: macOS 26.6.2, arm64; Xcode 27.0; Node 24.21.0; npm 11.19.0.
No partner Mac, actual two-network call, or movie session has been observed.

- `npm test`: 15 passing tests covering real geometry, trusted IPC predicates, asset allowlist, malformed settings, private atomic persistence and save failure.
- `npm run typecheck`, `npm run lint`: pass. RED tests observed before implementation; review's continuity assertion also failed against the earlier bundle before its repair.
- `npm start`: development window opens and native Mini/Escape restoration works. An initial EMFILE watcher failure was reproduced; explicit TypeScript exclusions for node_modules, out and .webpack stop the checker watching generated packages/dependencies. Restart then succeeded, with renderer `678142f8` and advancing frames. Development app/server stopped after the check.
- `npm run make:arm64`, `npm run make:x64`: succeed. `file` confirms arm64/x86_64 executable architectures. Both `codesign --verify --deep --strict` checks pass; minimum OS metadata is 14.0. Ad-hoc signing is not notarization or publisher verification.
- `npm run test:packaged`: both real arm64 launches pass 15 check groups each, for 320×180 and 160×90. Renderer-owned UUID remains unchanged across mode changes; counters advance; controls fit native bounds; trusted Tab/Shift-Tab, Enter/Escape and mouse-hover events work. Sandboxed renderer has no Node globals; bridge keys restricted; CSP rejects eval/network/new windows; invalid modes rejected. Screenshots/JSON: `out/verification/`.
- Camera/microphone **permission queries** return denied. A direct capture-denial experiment remained pending and was terminated; acquisition denial is unverified, not a passing media test. No capture code is present in the probe.
- Native UI: normal→mini→Escape observed. Later renderer ID `eb4d0e72` started normally; mini counters advanced from 106 to 1,911 while a Chrome 155.0.8059.40 local canvas-video fixture entered native full screen. App-specific screenshots cannot establish composited overlay visibility; the full-screen visibility gate stays pending. Safari fixture was also tried without conclusive visibility evidence. Test tabs and local server were closed.
- Independent whole-change review found two verification gaps; fixed renderer-owned identity and minimum-size trusted keyboard/hover checks, plus HTML language. No confirmed exploitable IPC defect was identified. This limited review is not the future calling/security milestone.

## Dependency advisories

`npm audit --omit=dev --json`: zero vulnerabilities. Full `npm audit --json`: eight dependency advisories (six high, two moderate), exits 1. `braces` nested-pattern denial of service propagates through `chokidar`, `micromatch`, `http-proxy-middleware`, `webpack-dev-server`, and Forge's Webpack plugin. `uuid` buffer-check advisory propagates through `sockjs`. The current app package contains only bundled app code, styles/HTML, preload and package metadata; these dev-server packages are absent. No external patterns/proxy inputs are accepted by this project; the dev server is loopback-only with hot reload/client disabled. This limits exposure, but it does not declare the advisories fixed. Do not browse untrusted content while a development server is running. npm's suggested Forge 0.0.2 downgrade is not a safe maintained-tooling remedy. Recheck upstream updates before development resumes.

Electron/Chromium still needs periodic security updates; zero production npm advisories alone cannot establish engine security.

## Artifacts and reproducibility

Archives: `out/make/zip/darwin/{arm64,x64}/ZoomTime-darwin-{arm64,x64}-0.1.0.zip`. Final source revision, architecture, exact build commands, dependency pins/lock hash and SHA-256 are recorded by `npm run checksums` in `out/distribution/build-manifest.json` and `SHA256SUMS`. Build one architecture at a time. Use the manifest's revision to reproduce; artifacts and personal preferences are Git-ignored.

Not verified: girlfriend's installation, actual movie service visibility on either Mac, QuickTime, monitor removal/scaling, physical Space switching, Intel execution, downloaded Gatekeeper approval/update, capture-denial execution, future Keychain/calling/recovery, two-network connection, long calls. A native bundle running locally does not prove a quarantined downloaded install.

## Rulings

- Fresh project: work in this user-specified empty workspace on a new feature branch; no redundant worktree or existing branch to protect.
- Forge 8 renamed the template flags to `--template=webpack --typescript`; preserve the requested maintained TypeScript/Webpack approach.
- The full plan is already approved. Implement directly; do not create an additional design-permission loop.
- Preserve gate order: lack of both-Mac physical evidence means deliver phase 1 artifacts and stop before networking, not pretend the full app is done.
- Ad-hoc signing uses the supported non-hardened-runtime profile: the packaged smoke reproduced a dyld Team-ID/library-validation failure with hardened runtime. Only JIT entitlement is included in the probe, removing the signer's unnecessary camera/location/USB defaults. Renderer sandbox/isolation and OS Gatekeeper remain enforced. Cost: this private build lacks hardened-runtime protection and publisher identity; revisiting distribution signing is required before public use.

## Resume

Read AGENTS.md, docs/ARCHITECTURE.md, docs/ITERATIVE_GUIDE.md and the implementation plan. Share the matching probe zip and checksum; use docs/MANUAL_TESTS.md on both Macs with the actual movie players. Record results, then proceed to private signaling only after the window gate passes. No system/Tailscale settings have been changed.
