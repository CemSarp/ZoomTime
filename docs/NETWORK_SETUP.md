# ZoomTime: setup for you and your friend

You each use your **own Tailscale account**. Invite your friend into your private Tailscale network, called a *tailnet*. Do not share your account password. [Tailscale account invitations](https://tailscale.com/docs/features/sharing/how-to/invite-any-user)

There are two separate invitations:

- **Tailscale invitation:** lets her Mac join your private network.
- **ZoomTime invitation:** pairs the two apps. It contains a secret; send it privately, never through a public GitHub issue.

Your Mac is the **host**. Her Mac is the **guest**. With ZoomTime0.3.1, neither Mac needs Terminal setup. Once paired, either person can start a call; both Macs, both apps and Tailscale must be running.

## 1. Install ZoomTime on both Macs

**Version note:** 0.3.1 includes the automatic Host flow below and is currently a local build, not published to GitHub. Install the supplied 0.3.1 ZIP on both Macs to use it. The existing GitHub0.2.0 download below requires the legacy manual setup further down.

Open the [0.2.0 download page](https://github.com/CemSarp/ZoomTime/releases/tag/v0.2.0). Under **Assets**, choose:

| About This Mac shows | Download |
| --- | --- |
| Apple M1/M2/M3/M4/M5 or another Apple chip | [Apple Silicon / arm64 ZIP](https://github.com/CemSarp/ZoomTime/releases/download/v0.2.0/ZoomTime-darwin-arm64-0.2.0.zip) |
| Intel processor | [Intel / x64 ZIP](https://github.com/CemSarp/ZoomTime/releases/download/v0.2.0/ZoomTime-darwin-x64-0.2.0.zip) |

Use Apple menu → About This Mac to check. Download the app ZIP, rather than GitHub's “Source code” archive. Neither of you needs Node, Xcode or a development environment. Requires macOS14+.

1. Double-click the ZIP to extract it.
2. Drag ZoomTime.app into Applications.
3. Open it from Applications.
4. If macOS says the developer cannot be verified, first make sure you downloaded the correct trusted build. After attempting to open it, go to System Settings → Privacy & Security → Open Anyway, then confirm Open. This approval is for this app; do not disable Gatekeeper. [Apple's instructions](https://support.apple.com/en-gb/102445)
5. If a Keychain prompt appears for ZoomTime, complete it locally. Camera/microphone access is requested when you Call or Accept. Do not send anyone your Mac password.

Optional integrity check: download SHA256SUMS into the same folder as the app ZIPs and run `shasum -a 256 -c SHA256SUMS` there. This checks both archives; if you downloaded only one, compare `shasum -a 256 /path/to/your.zip` with its matching line instead. The checksums belong to these exact release files.

These are unnotarized private builds, so a downloaded installation can have additional macOS prompts. Version0.2.0 is a prerelease: actual two-Mac/network and movie-session acceptance is still pending.

## 2. Put both Macs in the same Tailscale network

**You:** open the [Tailscale Users page](https://login.tailscale.com/admin/users), choose **Invite external users**, then **Copy invite link**. Choose a non-administrator role and generate the link. Send it privately to your friend yourself.

**Your friend:** open that link and sign in with her own identity. Install/open Tailscale on her Mac. If she already has a separate Tailscale network, select the network she just joined in the app rather than staying connected to her original network.

**Check together:** both Macs should appear on the [Machines page](https://login.tailscale.com/admin/machines), and both Tailscale apps should say Connected. If the console requires approval for her user/device, approve the intended one. Joining is governed by your existing network policy; other devices in the network may also be reachable under that policy.

If she cannot choose your network, use Tailscale's sign-in/account/network selector to add or select the invited network. Do not fix this by giving her your password. Do not create a device-share invitation for this walkthrough: joining the same network matches the agreed two-Mac setup.

## 3. On your Mac: click Host

1. Open ZoomTime0.3.1 and click **Host on this Mac**.
2. ZoomTime opens the installed Tailscale app. Finish any first-time sign-in or macOS VPN approval there, then click Host again if asked. You must already have Tailscale installed in Applications.
3. The app detects your actual private hostname and checks port8443. If unused, it configures private HTTPS forwarding to ZoomTime. No terminal commands or manually copied address are needed.
4. If HTTPS certificates are not enabled, open the [Tailscale DNS page](https://login.tailscale.com/admin/dns), enable MagicDNS/HTTPS certificates, then retry Host. ZoomTime cannot grant account-owner approval for you. Tailscale publishes certificate hostnames to certificate-transparency logs. Use a machine name you are comfortable having in those logs. [Tailscale HTTPS guidance](https://tailscale.com/docs/how-to/set-up-https-certificates)
5. Complete any local ZoomTime Keychain approval. Click **Copy invitation** and send it privately to your partner yourself. The app never sends it for you.

A different service, public Funnel, foreground service or old-hostname configuration on8443 is a conflict. The app leaves it unchanged. Do not use Serve reset or overwrite an unrelated service. If this host was renamed, review only its owned ZoomTime entry before resetting/re-pairing.

## 4. On her Mac: join

1. Copy the entire ZoomTime invitation you sent to her clipboard.
2. Open ZoomTime0.3.1 and click **Paste partner’s invitation**.
3. Finish any Tailscale sign-in/VPN or Keychain approval locally, then retry Join if needed.
4. Both apps should say **Ready to call**. Do not set up both Macs as hosts.

Pairing is normally done once. Future launches reuse encrypted pairing; do not reset it unless troubleshooting requires a fresh invitation. If Tailscale was explicitly disconnected, reconnect it in its app before retrying an existing pairing. No camera starts during setup.

<details>
<summary>Legacy manual setup for the published 0.2.0 app</summary>

## 3. On your Mac only: check Terminal access

Open Spotlight (⌘Space), type **Terminal**, and press Return. Run one command at a time:

```sh
tailscale status
```

You should see your Mac and the other connected devices. If it says you are logged out or stopped, reconnect using the Tailscale menu-bar app before continuing.

If Terminal says `command not found`, open Tailscale → Settings → CLI integration → Show me how → Install Now. Then reopen Terminal. For the App Store version, use `/Applications/Tailscale.app/Contents/MacOS/Tailscale` instead of `tailscale` in the commands below. [Tailscale CLI instructions](https://tailscale.com/docs/reference/tailscale-cli?tab=macos)

## 4. On your Mac only: give ZoomTime a private address

This is a one-time setup. It forwards a private HTTPS address to ZoomTime running on your Mac. It does not stream your movie or publish your app to the internet.

First inspect existing configuration:

```sh
tailscale serve status --json
```

```sh
tailscale serve get-config --all
```

If port8443 already has a service, stop here and report the conflict. Do not reset or overwrite it. During the agent's read-only check on2026-10-14, Tailscale was running and Serve had no configuration; recheck before making changes.

Open ZoomTime and leave it open. If8443 is unused, run:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:47831
```

If Tailscale asks you to enable HTTPS, follow its displayed link and enable HTTPS for your network, then rerun the command if requested. Do **not** enable Funnel. Serve makes the address available inside your Tailscale network. [Serve reference](https://tailscale.com/docs/reference/tailscale-cli/serve)

The output should show an address resembling this **example**, not your literal address:

```text
https://your-mac.your-network.ts.net:8443
```

Use your own printed hostname. For ZoomTime, replace `https://` with `wss://` and add `/zoomtime`:

```text
wss://your-mac.your-network.ts.net:8443/zoomtime
```

Keep `:8443` and `/zoomtime`. Copy the complete result. You only need to do this on the host Mac; your friend does not run Serve. A404 in a web browser is expected because the endpoint accepts authenticated app connections, not web pages.

## 5. Pair the ZoomTime apps

**On your Mac:**

1. Paste your complete `wss://…ts.net:8443/zoomtime` address into **Your private Tailscale endpoint**.
2. Click **Set up this Mac as host**.
3. Complete any local Keychain approval.
4. Click **Copy invitation** and send the copied text privately to your friend yourself. It contains a credential; never put it in the repository or release notes.

**On her Mac:**

1. Copy that entire invitation text to her clipboard.
2. Open ZoomTime and click **Paste partner's invitation**.
3. Complete any local Keychain approval.

Do not set up both Macs as hosts. Pairing is normally done once. When both apps connect, they should say **Ready to call**. If pairing was already completed successfully, keep it; no reset is needed for this guide.


</details>

## 6. Make the first call

1. Put on headphones and keep both Tailscale apps connected.
2. Either person clicks **Call your partner**.
3. The other clicks **Accept call**.
4. Allow the trusted ZoomTime build to use camera/microphone if macOS asks.
5. Confirm you can both hear and see each other.
6. Click **Mini window** (0.2.0: **Open mini mode**), then put your movie into full screen. Hover or Tab reveals the controls. Escape restores normal size while ZoomTime is focused.
7. Click **End call** when finished. Closing/quitting also ends capture. Your host Mac/app must stay awake/open during calls.

Each person plays the movie separately. Native Dock minimization hides the window; use Mini to keep the small video visible. There is no app-imposed meeting timer.

## Make the view yours (0.3.0)

Open **Settings…** or press **⌘,**. Choose 720p for normal use, 1080p for more detail, or360p for lower data/power use. Actual quality may be lower because of the camera or network. Settings affect the video this Mac sends; each person chooses their own.

**Mirror my preview** flips only your own view. **Show me in mini mode**, or **You** in mini controls, shows your muted self-preview. Drag its bottom-right corner or use the size slider to resize it in either mode. All five controls remain accessible by hover/Tab at160×90. The preview hides when your camera is off.

Escape exits app full screen or restores mini; **⌘M / −** minimizes to Dock after leaving full screen. Dock minimization hides the video window while the call continues. Use **⌘⇧M / Mini window** to keep it floating above your movie.

## Check camera and voice before calling (0.3.1)

Open **Settings… → Camera & microphone check** and click **Start camera & mic check**. Allow camera/microphone if macOS asks. Your video appears and the microphone meter moves when you speak. To hear your own voice, use headphones and enable **Listen to my microphone**; it is off by default. The sound is live, never recorded or sent to your partner.

Stop check or close Settings when finished. The check also stops after two minutes, when a call arrives/starts, or on mini/sleep/reload/quit. End an active call before checking devices. A cancelled permission prompt may finish later; those returned tracks are discarded. A device/permission error provides a retry without starting a call.

## If something does not work

| What you see | Next step |
| --- | --- |
| Waiting for partner / host unavailable | Both apps open, both Macs connected to the same invited Tailscale network; host Serve running. Try `tailscale serve status`. |
| Worked before a Tailscale device rename/re-registration | Compare the saved endpoint and Serve hostname with the device’s current DNS name. A stale name can cause DNS/TLS failures before calling. Repair only the owned ZoomTime Serve entry, then host resets/recreates pairing with the current endpoint and guest imports the new invitation. Do not reset unrelated Serve services. |
| Wrong endpoint | Use the hostname from your own Serve output, `wss://`, port8443 and `/zoomtime`; do not copy the example hostname. |
| Pairing rejected | Check that she imported your ZoomTime invitation, rather than the Tailscale invitation; close competing app instances. |
| Keychain blocked | Unlock/approve locally and explicitly retry. Do not share your password. |
| Camera/microphone denied | System Settings → Privacy & Security → Camera / Microphone; check the trusted app, then retry Call/Accept. |
| Camera busy | Close the other camera app or explicitly choose Try microphone only. |
| Signaling connects but audio/video does not | This no-STUN/no-TURN design may not work across the actual networks. Record the failure; do not silently add a service or disable certificate checks. |

If you already use restrictive Tailscale access rules, they must allow guest→host TCP8443 and dynamic UDP between the two participating Macs. Review existing grants with the network administrator rather than replacing policies. Granting one signaling port is not enough for WebRTC media. [Grants syntax](https://tailscale.com/docs/reference/syntax/grants)

Tailscale can use its encrypted DERP relay independently of WebRTC TURN. Successful private signaling does not prove which media route works. Physical two-Mac/network, full-screen and long-session tests remain required. No live network settings or invitations were changed/sent by the agent for this walkthrough.
