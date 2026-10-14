# Private network setup

ZoomTime does not install a VPN, configure Serve, enable Funnel, change firewall rules, or log into an account. Tailscale was not installed on the development Mac when checked on 2026-10-14, so these are documented setup commands, not commands already executed here.

1. Install the recommended standalone Mac app using [Tailscale's macOS instructions](https://tailscale.com/docs/install/mac). Connect both Macs to your intended private tailnet. Complete its login/VPN permissions yourself; do not share account passwords with a coding agent.
2. Use the Tailscale CLI supplied/configured by your chosen installation. Check `tailscale status`. The host's full MagicDNS hostname must end in `.ts.net`. Enable MagicDNS and HTTPS as directed by Tailscale if needed.
3. Before any changes, inspect existing services:

```sh
tailscale serve status --json
tailscale serve get-config --all
```

If HTTPS 8443 is already used, stop and report the conflict. Do not reset Serve or replace existing services/policies.

4. With ZoomTime open and the listener unused, expose only its loopback backend privately:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:47831
```

Serve handles the HTTPS certificate. Use its displayed full hostname to form `wss://your-host.your-tailnet.ts.net:8443/zoomtime` in ZoomTime. Port 47831 is bound only to loopback. A 404 when opening the backend in a browser is expected: it accepts authenticated WebSocket upgrades at `/zoomtime`, not a web UI. [Serve command reference](https://tailscale.com/docs/reference/tailscale-cli/serve)

5. Have the tailnet administrator scope access to the two actual device identities/addresses: guest→host TCP 8443 for signaling and bidirectional dynamic UDP for host-candidate media. Merely allowing the signaling port is insufficient. Review existing grants first: adding narrow grants does not remove broader existing access. Preserve unrelated policies; do not paste a replacement policy over them. [Tailscale grants syntax](https://tailscale.com/docs/reference/syntax/grants)
6. Pair in the app, keep both apps open, and make the first call using headphones. Never enable Funnel, router forwarding, public STUN/TURN, insecure HTTPS targets, or certificate bypasses for ZoomTime.

Tailscale can forward WireGuard-encrypted traffic over DERP. That is separate from WebRTC TURN. WebRTC may select Tailscale, ordinary LAN, or another reachable direct path; inspect the selected candidate statistics rather than inferring media routing from signaling. If the actual networks cannot connect under the agreed no-TURN architecture, preserve the evidence and stop release work until that decision is explicitly revised.
