# Native screen capture: capabilities and evidence

Implementation date: 2026-10-17. Runtime: macOS 26.6.2 (25G83), arm64. Toolchain: Xcode 27.1 (27A9275), SDK 27.0, Swift 6.4, deployment target macOS 14. This is unpublished work on top of ZoomTime 0.3.4. No release, installed-app replacement, invitation or tailnet change was performed.

## Use and architecture

Future builds (when separately authorized): `npm run build:capture` on native Apple Silicon. Intel/Rosetta and x64 builds are deprecated and rejected. `npm start` builds the native helper automatically; Forge packaging builds/bundles the matching helper. Recipient Macs do not need Xcode or Swift installed.

In Settings, **Allow screen access** checks the current grant before requesting Screen Recording consent. It never repeats a failed request in the same session. **Screen Recording settings** opens the OS pane for the current app; after changing its grant, quit and reopen from Applications before refreshing. **Refresh sources** checks existing permission without requesting it. Choose one display or Command-click one to four windows, then **Start local capture**. **Switch selected sources** reuses the encoder/output. **Stop capture** drains H.264; **Show local output** reveals the local file. Closing Settings, mini mode, reload, sleep or quit stops capture. Opening Settings starts nothing. OS denial explains System Settings recovery; no TCC reset, entitlement escalation or security bypass is implemented.

The native interfaces are `StandardScreenCaptureSource`, `WindowCaptureSource`, `CompositeFrameRenderer`, `VideoEncoder`, and `Transport`/`LocalFileTransport`. Display/window streams feed bounded latest-frame slots; Core Image renders aspect-fit tiles on Metal into an IOSurface-backed BGRA pool; hardware-required VideoToolbox produces realtime H.264. Queue depth is three per SCStream, at most three encoded frames are pending through transport and the render pool is capped at six buffers. Backpressure drops scheduled frames and counts them. File writes run serially outside the metrics lock. Stream failure or suspension blanks only the affected tile. A black image has no reliable DRM meaning.

Outputs are unique owner-only `session-*` directories under the Electron profile's `captures/`: `capture.h264` plus `capture.h264.png` for the first composition in which every source supplied pixels. Files use exclusive creation and are never overwritten. H.264 is Annex B with SPS/PPS on keyframes, 1280×720, approximately 30 fps, target 4 Mb/s, no frame reordering, no audio or container timestamps. The file can be consumed as a raw 30 fps H.264 stream; it is not an MP4. Source changes after the first PNG are visible in the encoded file. The existing encrypted camera/microphone call is unchanged. **Partner screen transmission is not implemented.**

## Capability matrix

| Capability | Result | Evidence / limit |
| --- | --- | --- |
| Lazy permission/discovery | Source regression tests; actual user-launch recovery pending | Prior Codex-launched grants are not evidence of ZoomTime’s own grant. User launch shows signature mismatch/denial. New preflight, no-repeat and Settings recovery logic is source-only; no new binary was built. |
| Ordinary desktop SCStream | Verified on this Mac | Real display capture, encoded output and decoded nonblank 1280×720 frames. |
| Two-window composition | Verified | Controlled red/blue AppKit windows appear together in actual SCStream PNG and decoded H.264. Synthetic color assertions also pass. |
| Movement and resizing | Verified on Tahoe | Fixture changes real NSWindow bounds while encoding continues. Decoded output remains valid. |
| Window disappearance / invalid selection | Verified locally | Missing ID rejected before disturbing active sources. Suspension/closure blanks a tile while another source continues. macOS 14 closure behavior remains untested. |
| Display/window source switching | Verified on one display | Same output/encoder changes from display to surviving test window. Switching between two physical displays and hot-unplug remain pending: only one display is connected. |
| Metal composition + hardware H.264 | Verified | VideoToolbox hardware query is true; actual samples decode and retain expected colors. Slow-transport self-check verifies bounded pending work and nonzero drop accounting. |
| Local Transport | Verified | Real Annex B files decode through VideoToolbox. Write failures propagate to the session and preserve partial output; disk-full behavior has not been physically induced. |
| Protected-content detection | Unsupported as a reliable classification | SCFrameStatus describes complete/idle/blank/suspended/started/stopped, not FairPlay. UI says protected capture unsupported/unknown. No black-pixel heuristic or false DRM diagnosis. |
| FairPlay-protected pixels | Not demonstrated; unsupported by this implementation | No controlled authorized FairPlay test asset/session was supplied. No validated protected pixels, no decryption/bypass attempt, no private production source. Ordinary screenshots and owned IOSurfaces are not evidence of protected capture. |
| Intel / macOS 14 | Intel deprecated; arm64/macOS14 execution pending | Earlier x86_64 compilation is historical. Future source rejects Intel/Rosetta; macOS14 floor remains for arm64. |
| Remote screen transport / long session | Not implemented / pending | This deliverable provides the requested functional local transport. Existing second-Mac, two-network/no-TURN and long-call release gates remain. |

## Protected-content interface investigation

The probe runs as the ordinary logged-in user, without new entitlements or elevation. Screen Recording was granted to the tested Codex-responsible process; that does not establish a grant for independently launched ZoomTime. A symbol lookup through a framework handle can resolve a dependency's export; `lookupScope` is not proof of the defining binary.

| Interface | Established signature / privileges | Actual result on Tahoe | Protected-pixel conclusion |
| --- | --- | --- | --- |
| ScreenCaptureKit | SDK-declared `SCShareableContent`, `SCContentFilter`, `SCStream.startCapture()`, `SCStreamOutput.stream(_:didOutputSampleBuffer:of:)`; user Screen Recording grant, no new entitlement in this app | Real IOSurface-backed CVPixelBuffers, visible fixtures, hardware encode/decode | Ordinary content verified; no reliable FairPlay metadata or verified protected pixels. |
| `CGDisplayCreateImage` | SDK `CGImageRef CGDisplayCreateImage(CGDirectDisplayID)`; normal GUI session/Screen Recording. Obsolete since macOS15 in current headers | Non-null 3456×2234 image; PNG written and desktop image inspected | Ordinary desktop only. Not integrated: obsolete API gives no demonstrated protected capability. |
| `CGWindowListCreateImage` | SDK `CGImageRef CGWindowListCreateImage(CGRect, CGWindowListOption, CGWindowID, CGWindowImageOption)`; same consent boundary. Obsolete since15 | Non-null 3456×2234 image; PNG written and inspected | Same limitation. Symbol presence does not establish FairPlay access. |
| `CGDisplayStreamCreateWithDispatchQueue` | SDK `CGDisplayStreamRef (CGDirectDisplayID, size_t, size_t, int32_t, CFDictionaryRef, dispatch_queue_t, CGDisplayStreamFrameAvailableHandler)`; callback `(CGDisplayStreamFrameStatus, uint64_t, IOSurfaceRef, CGDisplayStreamUpdateRef)` | Created; Start=0; frame status=0; IOSurfaceLock=0; actual1280×720 PNG; Stop=0; frame/stop waits=0 | Ordinary desktop surface only; obsolete, not integrated. |
| `IOSurfaceCreate`, `IOSurfaceLookup`, `IOSurfaceLock`, `IOSurfaceGetBaseAddress` | SDK `IOSurfaceRef (CFDictionaryRef)`, `IOSurfaceRef (IOSurfaceID)`, `kern_return_t (IOSurfaceRef, IOSurfaceLockOptions, uint32_t*)`, `void* (IOSurfaceRef)` | Own16×16 BGRA surface created, lock/unlock=0, own-ID lookup non-null, written bytes read back | Verifies only this process's own allocation. No foreign surface IDs enumerated; no evidence of protected-surface access. |
| `CGSHWCaptureWindowList`, `SLSHWCaptureWindowList` | Symbols resolve; no authoritative declaration found in installed public SDK headers. Actual ABI, entitlement and process-privilege requirements remain unestablished | `dlsym` succeeds; **never called**; no return value/pixel buffer claimed | Technically blocked at ABI/privilege contract; no guessed signature or additional capture source. |
| `CGSGetWindowCaptureBounds`, `SLSGetWindowCaptureBounds` | No installed SDK declarations found | `dlsym` returns null in tested scopes | Unavailable in this probe. Bounds alone would not establish pixels. |

The current SDK deliberately marks the legacy CoreGraphics capture functions obsolete; the C harness targets macOS14 and uses the declarations directly. Deprecation warnings are retained in the build log. Private symbols are inventory only; no `unsafeBitCast` or invented function pointer signatures are present. No system settings, Gatekeeper, TLS, sandbox, TCC database, SIP or FairPlay protections are changed.

## Reproduce and inspect

- `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`.
- `npm run test:capture`: real Metal composition → hardware encoding → decode, red/blue pixel assertions, no-overwrite assertion and slow-transport backpressure. The source images are explicitly synthetic.
- `node scripts/capture-live-test.mjs`: opens only two controlled fixture windows, moves/resizes/closes one, rejects a missing ID, captures the display and switches to the remaining window. Requires an existing OS grant and stores local evidence under `out/verification/capture-live/run-*`.
- `node scripts/capture-app-test.mjs [absolute-path-to-packaged-executable]`: runs the packaged app with an isolated profile and test-only loopback debugging, exercises actual Refresh/Start/Settings-close UI and verifies sandboxed renderer, encoded frames and stopped state. It never starts a camera/microphone or changes a live tailnet.
- `out/native/arm64/ZoomTimeCapture permission` and `... probe`: structured preflight/symbol/owned-IOSurface results. `... request` is explicitly user initiated.
- Build file decoder: `xcrun swiftc -swift-version 5 -parse-as-library -O native/screen-capture/Pipeline.swift native/screen-capture/Inspect.swift -o out/native/capture-inspect`, then `out/native/capture-inspect /absolute/capture.h264`. It validates all saved H.264 slices, saves first/last decoded PNGs and counts visible/red/blue samples. Use a fresh output path: PNGs are exclusive-created.
- Legacy harness: `xcrun clang -fblocks -mmacosx-version-min=14.0 -framework CoreGraphics -framework ImageIO -framework CoreFoundation -framework IOSurface native/screen-capture/LegacyProbe.c -o out/native/legacy-probe`, then pass a **new private output directory**. It captures the ordinary desktop; avoid sensitive visible content. It is not packaged as a capture source.

Local evidence may contain visible private desktop content. It stays ignored under `out/`, outside source/packages/publication; no automatic cleanup is performed. Use the controlled fixture PNG for shareable evidence.

Primary references: [Apple ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit), [hardware-required VideoToolbox encoding](https://developer.apple.com/documentation/videotoolbox/kvtvideoencoderspecification_requirehardwareacceleratedvideoencoder), plus the installed SDK's `SCStream.h`, `CGWindow.h`, `CGDirectDisplay.h`, `CGDisplayStream.h`, `IOSurfaceRef.h` and `VTCompressionSession.h` declarations. Runtime observations above take precedence over assumptions about what an obsolete/private symbol might do.

## Earlier pipeline run record (before the permission correction)

- `npm test`: **90/90**, zero skipped/failed; `out/verification/capture-unit-suite-complete.log`.
- `npm run test:capture`: passed including hardware query, decoded color assertions, slow/error transport; `out/verification/capture/run-HjRVwr/result.json`. 120 synthetic frames and transport checks completed in0.537s; this throughput figure is not a sustained desktop/power benchmark.
- Live real-window/display run: `out/verification/capture-live/run-ahrDIb/result.json`, `decoded-windows.json`, `decoded-display.json`, H.264 and first/last decoded PNGs. Windows234 frames / mean4.10ms / max15.96ms; display→window145 frames / mean4.35ms / max21.04ms; hardware=true, drops=0 in both short runs. Frame counts include continued ordinary output after one window closes.
- Final packaged UI: `out/verification/capture-app/run-q73Kya/result.json` and `app.png`. Actual Refresh/Start and Settings-close produced100 frames, hardware=true, drops=0, mean4.56ms / max17.77ms; pending=0 on stop, previewWritten=true. Invalid permission-request and arbitrary-path IPC calls were rejected (expected error entries in test stderr).
- Build: `out/capture-20261017-final/ZoomTime-darwin-arm64/ZoomTime.app`. Deep/strict signature verification passes. Bundle and native x64 helper minimum OS14.0 verified; helper is x86_64. ASAR contains only bundled main/preload/UI and package metadata, with the native executable alongside it; source/tests/private outputs are absent. No npm dependency was added or changed. The helper receives the existing packager's JIT/camera/microphone entitlements; capture itself adds no new entitlement and the probe does not exercise those unrelated permissions.
- Typecheck, lint, script syntax and diff checks pass. Legacy harness compiles with expected deprecation warnings. Complete old packaged/window/generated-media suites were not rerun; the existing smoke bridge allowlist now includes the six explicit capture methods.

## Current source-only follow-up and permission blocker

The user requested branch `codex/screen-capture`, a source push and no new builds. Apple Silicon is now the only supported architecture across startup, builds, updates and checksum collection; historical Intel assets are retained. The pipeline/PNG/encoder results above remain historical observations of the earlier binary, not tests of the new permission code.

At00:31:32–00:31:35 on2026-10-17, tccd reported `Failed to match existing code requirement for subject com.cemsarp.zoomtime and service kTCCServiceScreenCapture` and `Service kTCCServiceScreenCapture does not allow prompting; returning denied.` The responsible process was the user-launched ZoomTime candidate; earlier automated launches had Codex as responsible process. Scoped log evidence stays local in `out/verification/screen-capture-branch/tcc-permission-evidence.log`; no private system log is committed.

Source corrections: check `permission` before `request`; skip a new request for a valid grant; at most one request attempt per app session while always rechecking current permission; return a typed `screen-permission` error rather than generic discovery failure; add explicit fixed-URL Screen Recording settings recovery. The native request command also preflights before requesting. No TCC reset, widened signing requirement, entitlement or security bypass is used.

Recovery requires the user to authorize the **current copy** of ZoomTime in System Settings → Privacy & Security → Screen & System Audio Recording, then quit and reopen it from Applications and Refresh sources. An enabled entry for an old ad-hoc code hash may need reauthorization for the current copy. No code can silently migrate that consent. Source tests cover the request/recovery flow, but this user-launched OS path must be tested after a future build is explicitly requested.

References: [Electron permission status and restart guidance](https://github.com/electron/electron/blob/v44.7.1/docs/api/system-preferences.md), [Apple screen access request](https://developer.apple.com/documentation/coregraphics/cgrequestscreencaptureaccess()).

Current follow-up verification:96/96 unit tests, TypeScript, lint, Swift typecheck only, script syntax and diff checks pass. The x64 build guard was exercised only as an expected failure before compilation; retained Intel binary unchanged. Source review found no remaining blockers. No new binary or release accompanies this branch push. Software logs stay under `out/verification/screen-capture-branch/`.
