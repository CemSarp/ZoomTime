# 0.5.0 UI/UX review — 2026-10-21

Subsequent live echo revision: Reduce speaker echo now toggles within calls/device checks, has no Experimental label and uses a collapsed How it works section. [Current ledger](superpowers/plans/2026-10-21-live-speaker-echo.md) and [latest verification](VERIFICATION.md) supersede earlier echo behavior and candidate hashes below. The original UI-pass evidence is retained.


The user requested this pass before any GitHub push/publication: symbol-only microphone/camera controls in Normal and Mini, a three-dot menu without its disclosure arrow, and a complete visual/interaction audit. Publication and installed-app replacement are outside this iteration. The screenshot supplied by the user is visual reference only.

## Decisions and implementation

- One shared microphone/camera renderer supplies fixed local SVG artwork, slashed off states, action-specific accessible names and matching tooltips. Amber off states remain distinguishable by shape and accessible state. Muting/camera actions still use the existing MediaCall handlers in both modes.
- The native details disclosure keeps keyboard behavior while its default marker is hidden. Only three dots appear. Escape closes it and returns focus before Escape can restore Mini; clicking outside dismisses it. The pane stays within the stage and scrolls to every participant level.
- Normal media buttons are 36×36; Mini controls are 28×32 and its three-dot trigger is 28×26, fitting the existing 160×90 floor. This is a deliberate compact desktop target-size compromise, not a claim that every control meets a 44-point touch target. The optional self-preview is height-bounded at the smallest size so it clears the toolbar.
- Consistent 7–10-point control/card rounding, shared text-input surfaces, contact separators, section padding, progress sizing, native-looking switch geometry, visible focus rings and high-contrast border support. Contact checkboxes remain checkboxes rather than wide switch-sized boxes.
- Restrained 120–140 ms feedback on controls/switches; Reduced Motion disables transitions/animations. Theme changes do not animate button backgrounds through illegible intermediate colors. No tile, stream or peer is recreated for style/mode/pin changes.
- Long recipient names wrap within the minimum Normal window. Pairing status shares a row with its actions when space permits. Retry is hidden when online; a single tile has no redundant Pin/Grid action. Unpaired users do not see an ineffective People action.
- Member action accessible names identify their person. Preview tooltips track its setting. Mini uses a phone-down symbol while declining/leaving and × when closing the idle app. Main/Mini errors and modal errors are visible in their current context; unchanged live-region messages preserve their text nodes.
- Rename confines Escape to its modal and closes on entering Mini. Staged updates disable the no-op Check action. Main-process updater/session/capture guards remain authoritative.

Visual references: Apple's [buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [motion](https://developer.apple.com/design/human-interface-guidelines/motion) and [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) guidance informed familiar symbols, tooltips, consistent spacing, brief purposeful feedback and accessibility preferences. Artwork is local; no icon font, framework or runtime dependency was added.

## Complete control inventory

All 41 static buttons, dynamic member/tile actions and every input were read through to their existing handler. The new `npm run test:ui` runs the actual product renderer with a synthetic bridge/call snapshots and generated devices. It checks UI behavior without changing the user's group, clipboard, installation, update server or screen permissions. It is not evidence for those real external operations.

| Controls (IDs or dynamic actions) | Functionality and verification |
| --- | --- |
| `call`, `accept`, `reject`, `cancel`, `hangup`, `invite-members` | Explicit capture/request, acceptance, decline, cancellation, leave and invitation dispatch exercised in product renderer. Coordinator/service/socket tests and real generated mesh suite verify lifecycle and ten media links. |
| `mute`, `camera`, `mini-mute`, `mini-camera` | Both modes show SVG-only controls with accessible next actions. Actual generated microphone enabled state and camera track removal/reacquisition checked; same stream/element retained. Focused unit test covers all icon/off combinations. |
| `audio-only`, `devices`, `resume-audio` | Injected capture denial, ended generated microphone and autoplay denial exercise explicit retry, device recovery and Resume error clearance. Existing media suite also covers authorization, stale operations and recovery. |
| `mini`, `restore`, `close`, `minimize-window` | Renderer dispatch and context-specific close checked. Actual packaged native modes, Dock minimize/full-screen transitions, keyboard/hover, sizes and renderer identity checked. See intermittent native result below. |
| `mini-self`, `mini-people` | Preview preference and tooltip checked. People restores Normal, closes the menu and focuses contacts. Hidden while unpaired. |
| `host`, `manual-host`, `import`, `retry`, `reset` | Synthetic bridge action dispatch, setup states, reconnect visibility and reset/import flow checked. Actual packaged host/safeStorage/reset group remains pending under the user's prior instruction; no real group/profile was used. |
| `add-member`, dynamic Copy invitation/Rename/Revoke | Capacity disabling, named accessibility, synthetic action dispatch, rename/save/cancel and focus checked. Real encrypted registry/auth validation remains covered by unit/service tests; actual packaged operations pending. No invitations delivered. |
| `rename-save`, `rename-cancel` | Save updates a literal name and closes; Cancel returns focus. Escape does not affect native fullscreen; Mini closes the modal. |
| `open-settings`, `settings-close` | Open/Done, persisted inputs, modal error visibility and media cleanup checked. Packaged tests verify opening is capture-free and closing/entering Mini stops a generated device check. |
| `check-start`, `check-stop`, `check-listen` switch | Generated camera/microphone preview, meter, explicit monitoring/stop and cleanup checked in renderer/package/media harnesses. Real acoustic routing remains pending. |
| `screen-request`, `screen-settings`, `screen-refresh`, `screen-start`, `screen-stop`, `screen-reveal` | All six routes exercised against synthetic bridge; existing helper/validation tests remain. No real permission request, screen capture or private output inspection in this pass. The independent permission bug remains unresolved. |
| `update-check`, `update-download`, `update-install`, `update-reveal` | Synthetic discovery/staging, ready-state Check disabling and visible guarded-restart/recovery errors checked. Packaged test performs explicit real discovery only. Prior signed A→B→C evidence is historical; no installation/update was applied here. |
| Contact checkboxes; `focus-person`; per-person ranges; `output-volume` | Selection, pin/grid, stable element identity and multiplied local-only gain checked. Draft master preference still survives native geometry broadcasts. Both Mini sizes have scroll/reachability checks. |
| `normal-always-on-top`, `mini-always-on-top`, `mirror`, `mini-self-setting`, `speaker-echo-reduction`, `quality`, `preview-size` | Preference dispatch/persistence and states checked; real packaged window level/mirror/preview tests and media quality tests retained. Echo is opt-in and actual acoustic efficacy remains pending. |
| `endpoint`, `member-name`, `rename-name`, `screen-kind`, `screen-sources`; other details summaries | Required/bounded named inputs, themed surfaces, selection and native disclosure semantics reviewed. Screen options are synthetic in the new renderer harness. Main-process validation still handles untrusted values. |

## Fresh results and artifacts

- `npm test`: **142/142 pass**. Focused media-icon test observed failing before implementation and passing afterward; pin redundancy has focused assertions.
- `npm run typecheck`, `npm run lint`, `git diff --check`: pass.
- `npm run test:ui`: passes seven scenario groups, including all static button handlers, dynamic actions, 2–5-person snapshots, maximum-length names at 640×420, both Mini sizes, light/dark, media error recovery, menus and modal focus.
- `npm run test:media`: passes the real local WebRTC/generated-device 2–5-client suite, **152196 ms** for the whole suite, not a continuous-call benchmark.
- Fresh `npm run make:arm64` succeeds. `npm run test:packaged -- --ui-only`: **28 groups at each Mini size** on the final sequential rerun. An earlier final-build run failed the native full-screen→Dock minimized assertion; no production window code or test threshold was changed, and the sequential rerun passes. Keep this as an intermittent native Spaces/activation acceptance item; a green rerun does not establish physical reliability.
- App/helper certificate pins, detached native feed signature, arm64/macOS14 metadata, unchanged Electron fuses, six-file ASAR payload, all five compiled-source comparisons and exact ZIP extraction/tree pass. Synthetic harness files are absent from the app.
- Current signed candidate: `out/incremental-releases/0.5.0-3IYixb/ZoomTime-darwin-arm64-0.5.0.zip`, SHA-256 `19191e27fac2b9a3bc3e97ac9ef9795b5994c4e950a020bb3abe461231934525`. It supersedes earlier local candidates; all old artifacts remain. Honest dirty-tree provenance is in its manifest; publication needs a clean rebuild later.

Evidence under `out/verification/`: `ui-pass-unit-final.log`, `ui-pass-renderer-final.log`, `ui-pass-media.log`, `ui-pass-build-final.log`, `ui-pass-packaged-final.log` (failure retained), `ui-pass-packaged-final-rerun.log`, `ui-pass-update-final.log`, `ui-pass-artifacts.{json,log}`. Renderer report/screenshots: `out/ui-tests/report.json`, `group-{2,3,4,5}-normal.png`, `group-5-{mini,menu}-{160,320}-{light,dark}.png`, `long-names-normal-minimum.png`, `settings-{light,dark}.png`. These are explicitly synthetic calls/devices. Packaged UI reports/screenshots remain under `out/verification/`.

Two focused independent read-only reviews covered controls and the final scoped code. Identified issues were fixed; final review found no blocking issues. Existing unrelated updater/volume changes and historical files were preserved.

Still pending: real host/member/safeStorage package group as previously requested; VoiceOver and physical pointing on both Macs; actual camera/microphone/output routing and audible gain; normal-launch permission continuity and the screen-capture permission bug; downloaded upgrade/install/recovery; physical rapid full-screen/Dock/Spaces behavior; actual group networks and long-session performance. No GitHub push/publication, installed-app replacement, invitation, TCC/trust reset or tailnet change occurred.
