# ZoomTime instructions

Read `docs/ARCHITECTURE.md`, `docs/ITERATIVE_GUIDE.md`, and `HANDOFF.md` before changing the project.

- User revision2026-10-17 authorizes one private group of 2–5 named members, one active call, targeted invitations and mesh WebRTC. Preserve two-person behavior in the same engine. The signaling host may leave media while its app stays open; host shutdown/sleep still ends the group. See docs/superpowers/specs/2026-10-17-group-calling-design.md. Apple Silicon (arm64) only, macOS 14+, Electron/TypeScript/plain HTML/CSS. Intel/Rosetta support was retired; preserve historical releases/artifacts.
- One BrowserWindow and renderer own the call across normal/mini modes.
- No FaceTime capture, STUN, TURN, public hosting, call recording, analytics, movie synchronization, mobile client, or unattended/background updates. User revision2026-10-17 permits explicit native screen capture and local diagnostic H.264/PNG output; protected-content access requires validated pixels, with no FairPlay/security bypass. Partner screen transmission is not implemented. User revision2026-10-16 permits explicit Check → Download → Install and restart with verification, preserved backups and normal macOS security checks.
- Do not weaken sandboxing, context isolation, TLS checks, Gatekeeper, or permission handling.
- Never store pairing secrets as plaintext or print them in logs/URLs.
- Preserve unrelated files and system configuration. Do not delete files without explicit approval.
- Follow the physical acceptance gates for release. On 2026-10-14 the user reported their Mac's full-screen test passing and requested continued implementation; proceed with software work while explicitly retaining the second-Mac and real two-network/long-call tests as release blockers. Do not treat local automated tests as that physical evidence, or bypass an observed cross-network failure.
- No extra review/approval is needed for ordinary work already authorized by the user; the acceptance gates are evidence requirements, not repeated permission requests.
- Keep changes small, add focused behavioral tests for nontrivial logic, and run the full suite and typecheck.
- Keep README, architectural reasons, manual-test evidence, and HANDOFF current. Mark unavailable evidence as pending.
- Do not publish, send pairing invitations, or change live tailnet settings automatically.
- User revision2026-10-17 now authorizes building the current group-calling source and updating the local ZoomTime Experimental app for testing, preserving its previous bundle. Local generated-media and packaged checks may use isolated profiles. Do not replace the regular ZoomTime app, publish, send invitations, change live tailnet settings, or treat local checks as physical group acceptance.

- User revision2026-10-17 explicitly authorizes committing/pushing this version and publishing a new GitHub prerelease with updater-compatible arm64 assets. Disclose the remaining screen-capture permission bug. Preserve historical releases, bundles and profiles; physical acceptance remains pending.

The full agreed plan remains the authority. A user instruction can revise it; document revisions explicitly.
