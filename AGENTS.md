# ZoomTime instructions

Read `docs/ARCHITECTURE.md`, `docs/ITERATIVE_GUIDE.md`, and `HANDOFF.md` before changing the project.

- This is a private two-person Mac application, macOS 14+, Electron/TypeScript/plain HTML/CSS.
- One BrowserWindow and renderer own the call across normal/mini modes.
- No FaceTime capture, STUN, TURN, public hosting, recording, analytics, screen sharing, movie synchronization, mobile client, or unattended/background updates. User revision2026-10-16 permits explicit Check → Download → Install and restart with verification, preserved backups and normal macOS security checks.
- Do not weaken sandboxing, context isolation, TLS checks, Gatekeeper, or permission handling.
- Never store pairing secrets as plaintext or print them in logs/URLs.
- Preserve unrelated files and system configuration. Do not delete files without explicit approval.
- Follow the physical acceptance gates for release. On 2026-10-14 the user reported their Mac's full-screen test passing and requested continued implementation; proceed with software work while explicitly retaining the second-Mac and real two-network/long-call tests as release blockers. Do not treat local automated tests as that physical evidence, or bypass an observed cross-network failure.
- No extra review/approval is needed for ordinary work already authorized by the user; the acceptance gates are evidence requirements, not repeated permission requests.
- Keep changes small, add focused behavioral tests for nontrivial logic, and run the full suite and typecheck.
- Keep README, architectural reasons, manual-test evidence, and HANDOFF current. Mark unavailable evidence as pending.
- Do not publish, send pairing invitations, or change live tailnet settings automatically.

The full agreed plan remains the authority. A user instruction can revise it; document revisions explicitly.
