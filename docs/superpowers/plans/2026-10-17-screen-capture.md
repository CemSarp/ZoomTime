# Native screen capture implementation

The user's four-phase request authorizes implementation now and revises the prior exclusion of screen capture and local diagnostic recording. Preserve the existing Electron call, security boundaries, networking and physical release gates. No publication or system-security changes.

1. Add a Swift helper using ScreenCaptureKit display/window sources, a bounded latest-frame compositor using Core Image on Metal, hardware-required VideoToolbox H.264, and an Annex B local-file Transport. Build for the requested architecture with macOS 14 deployment floor.
2. Add lazy permission preflight/request/discovery and main-owned helper lifecycle, validated selection IPC and explicit Settings controls. Only explicit Start creates a private local output; Stop/reload/sleep/quit release capture. Keep encoded frames out of renderer IPC. Source changes preserve encoder/output.
3. Test real compositor/encoder/decoder with labeled synthetic frames; exercise actual capture where TCC permits. Retain permission errors and actual API codes. Probe private symbol availability without calling signatures lacking authoritative declarations. Do not identify blank frames as proven FairPlay.
4. Build/execute the app, full unit/typecheck/lint/native verification, update architecture/README/handoff/manual evidence and capability matrix with exact pending hardware/DRM cases.

Review focus: permission refusal never starts capture; stale/closed source never freezes as live; bounded buffers and encoder backpressure; output write errors stop capture; no privileged/private API enters the production source path. Protected content remains unsupported unless pixels have been validated.
