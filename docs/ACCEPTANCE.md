# Release acceptance: actual two-Mac movie workflow

Software tests are in VERIFICATION.md. User report on 2026-10-14: normal/mini and full-screen playback worked on the user's Mac only; player/version/duration were not supplied. This is accepted as that user's observation. The partner Mac and the actual two-network call have not been accessed by the agent.

Record per run: date, tester, both Mac models/processors and macOS versions, app revision/archive SHA-256, actual player/browser version, displays/scaling, network separation, headphones/output devices, observed candidate route and duration. Do not include secrets, raw SDP or personal IP addresses in shared reports.

| Scenario | Required result | Current physical evidence |
| --- | --- | --- |
| Downloaded clean installation | Matching architecture starts without Node/Xcode; supported per-app approval | Pending |
| Update over an installation | Pairing/settings preserved or clear Keychain recovery; no silent reset | Pending |
| Both actual networks | Authenticated private WSS and both directions of usable hardware audio/video | Pending |
| Sixty-minute real call | Live media beyond 40 minutes, no meeting restart; actual mini/full-screen workflow | Pending |
| Three-hour movie session | No app time cutoff, usable media, measured CPU/memory/bandwidth/thermals | Pending |
| Full-screen overlay | Visible/live over each actual player, keyboard controls usable, no focus stealing | User's Mac reported pass; partner pending |
| Window controls | Reach 160×90, freely resize/move, aspect-fit; controls via hover and keyboard | Local packaged automation passes; partner pending |
| Mode continuity | Same call/renderer/tracks through repeated mode switches | Local renderer/video and real-peer resize tests pass; actual call workflow pending |
| Pre-call device check | Explicit local preview/meter and opt-in microphone monitoring; stopping releases devices | Generated-media/packaged checks and lease expiry pass; physical headphone routing/feedback pending |
| Camera settings | Local preview mirror/mini visibility/size; quality changes without a new peer | Packaged preview/drag/settings tests and generated720p/1080p capture pass; real camera/remote image quality pending |
| Automatic network setup | Explicit Host discovers/configures private8443; conflicts stay unchanged; Join starts Tailscale | Controlled command-runner tests pass; live Host/Join and first-time OS/account approval pending |
| Full-screen exit | Mini/Dock/Escape work without reopening the app | Actual arm64 native full-screen→mini and Dock tests pass; partner pending |
| Privacy controls | Mute transmission; camera off releases track; on reuses sender | Generated-media tests pass; hardware pending |
| Cancel / reject / timeout / end / quit | Capture stops, late results discarded, second call usable | Local lifecycle tests pass; physical device LED check pending |
| Display/Space changes | View remains accessible; removal returns it to a screen | Geometry tests pass; physical removal/Spaces pending |
| Audio/device changes | AirPods/system output follows macOS; explicit default-device reacquisition | Generated device-failure/recovery passes; hardware routing pending |
| Brief outage / host departure | Working media survives bounded signaling recovery; expired recovery ends capture | Local actual socket/media reconnection passes; actual Tailscale outage pending |
| Sleep/lid/wake | Old call ends; camera does not silently restart | Code path reviewed; physical test pending |
| Stale remote video | Stats-based stale status; one host ICE restart; bounded cleanup | Generated-video freeze detection, one real restart and bounded cleanup pass; actual network freeze pending |
| No accumulated resources | No growing peer/transceiver/capture count or progressive memory growth | Two-transceiver identity and track cleanup pass across local calls; three-hour memory measurement pending |

Use Activity Monitor for whole-app/helper CPU and memory measurements and the app's Connection diagnostics for bandwidth/frame/RTT observations. Record actual numbers, not assumed budgets. A working encrypted call does not prove physical speaker echo suppression; use headphones initially.

Release remains unaccepted until the actual two-Mac/two-network, downloaded-package and long-session checks are recorded. No tests on one Mac, synthetic tracks or clock-advanced coordinator tests replace them.
