# Installing LessonCue

LessonCue is a local-network product. Install the server on a computer that remains at your school, church, training site, or other learning facility; connect the television devices to the same trusted network; and use a modern browser on another computer for administration.

## Recommended: headless Ubuntu or Debian server over SSH

These instructions are for a 64-bit Ubuntu or Debian server with no desktop or GUI installed. The server needs internet access during installation, a non-root SSH account with `sudo`, and a static or DHCP-reserved local IP address.

SSH into the server from your computer:

```bash
ssh YOUR_USERNAME@SERVER_IP
```

Paste these two commands into the SSH session. They install the small download prerequisites, then run the LessonCue installer. The installer detects Intel/AMD versus ARM64, installs server dependencies, downloads the latest release, registers the systemd service, waits for it to become healthy, and prints the browser address:

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates
curl -fsSL https://raw.githubusercontent.com/nickhighland/lessoncue/main/installers/linux/install-latest.sh | bash
```

The final message says `LessonCue is ready` and prints `http://lessoncue.local` plus a numeric fallback such as `http://192.168.4.75`. The SSH connection can then be closed; systemd keeps LessonCue running and starts it again after reboot.

### First browser setup

On a computer connected to the same local network, open the address printed by the installer. LessonCue will ask you to create the organization name, administrator username, and password. This account, the complete web interface, database, schedules, and media all remain on your local server.

LessonCue creates a private local pairing secret and displays a six-digit PIN that rotates every ten minutes to accounts with screen or settings authority. A user with **Server settings** permission can instead set a persistent six-digit local PIN under **Settings → Connection & pairing**. The same control switches back to automatic rotation at any time; the setting stays entirely on the local server.

### Give staff only the access they need

Open **Users** as an owner or an account with **User administration** permission. The built-in defaults are straightforward: Owners and Administrators receive all capabilities; Editors receive lesson planning, media uploads, and live playback; Viewers are read-only. Enable **Customize this role** to independently select lesson planning, media uploads, live playback, screen administration, user administration, server settings, backups and restore, and software updates.

Permission enforcement happens on the server even if someone constructs an API request manually. A permission change signs that account out of its earlier browser sessions. Only an owner can grant the Owner role or change another owner; other user administrators cannot grant capabilities they do not hold or change their own access; and the last active owner cannot be paused, demoted, or deleted. Accounts without screen or settings authority cannot see the local pairing PIN.

Native Linux installation configures `http://lessoncue.local` on standard HTTP port 80 automatically. A user with **Server settings** permission can change either `lessoncue` or the browser port under **Settings → Connection & pairing**. LessonCue applies the change and restarts itself; if a chosen port cannot be opened, it returns to the previous working port. Changing the name does not rename the Linux computer or SSH hostname. Keep the numeric address as a fallback for networks that block multicast DNS.

### Optional: use your own internet hostname with Cloudflare Tunnel

LessonCue does not require remote access. If staff must reach it away from the local network, native Linux installations can configure an outbound-only, remotely managed Cloudflare Tunnel from **Settings → Optional remote access**. You need a domain managed in your own Cloudflare account. Protect the hostname with Cloudflare Access before inviting users; without Access, anyone on the internet can reach the LessonCue sign-in page.

1. In the [Cloudflare dashboard](https://one.dash.cloudflare.com/), create a remotely managed Cloudflare Tunnel.
2. Add a published application route using the hostname you want, such as `lesson.example.org`.
3. Set its service to the exact **Local origin route** shown by LessonCue, normally `http://127.0.0.1:80`.
4. In the tunnel's **Overview → Add a replica** instructions, copy the `eyJ…` tunnel token or the complete `cloudflared service install …` command. Do not run it over SSH.
5. In LessonCue, open **Settings → Optional remote access**, enable the tunnel, enter the same public hostname, paste the token or command, acknowledge the exposure warning, and select **Install and enable tunnel**.
6. Wait for LessonCue to report active edge connections, then open the HTTPS public address. The first connection can take more than a minute on networks where `cloudflared` must fall back between transports; LessonCue leaves the service enabled so it can keep retrying.

The native installer pre-downloads and verifies the supported `cloudflared` connector even while remote access is off. LessonCue checks that pinned connector daily, refreshes it when an application update approves a newer version, and reports the installed version and last verification in Settings. Downloads are cached under `/var/cache/lessoncue`, verified against Cloudflare's published SHA-256 digest, checked for successful execution, and installed atomically. A working connector is restored if an active tunnel cannot restart with a replacement.

The browser sends the tunnel secret once. LessonCue passes it through the protected root operation channel, stores it outside the web server's readable files, and never returns it through the API or writes it to the audit log. The connector runs as the separate `lessoncue-tunnel` user. Disabling the feature stops the connector and deletes its stored credential while leaving the verified connector ready for later use, and leaving `lessoncue.local` and the numeric local address unchanged.

If you later change LessonCue's HTTP port, update the Cloudflare published application service to the new **Local origin route**. Paste a replacement token and select **Update tunnel** to rotate the connector credential. For diagnostics over SSH:

```bash
sudo systemctl status lessoncue-cloudflared --no-pager
sudo journalctl -u lessoncue-cloudflared -n 100 --no-pager
sudo systemctl enable --now lessoncue-cloudflared
```

The connector needs outbound access to Cloudflare on port `7844` (UDP for QUIC or TCP for HTTP/2). If the service is active but no edge connection appears, verify the tunnel token in Cloudflare, allow outbound TCP or UDP `7844`, and select **Retry tunnel connection** in LessonCue. The published hostname route controls where requests go after the connector reaches Cloudflare; it does not establish the edge connection itself.

### Set up reusable lessons and schedules

No additional service or cloud account is required. Build one complete lesson under **Classes**, then open **Templates → New template** and select it as the source. LessonCue keeps media used by a reusable template permanently. Choose **Create lesson** for a one-time dated copy, or **New schedule** for weekly, multi-week, monthly, term-based, or explicit custom dates.

Choose how far LessonCue should generate ahead. The server checks enabled schedules daily, and **Generate now** safely fills only missing dates. Under each schedule, add school breaks, holidays, closures, or other skipped dates. LessonCue removes the lesson generated for that occurrence; click the date chip to restore and regenerate it. Pausing or deleting a schedule leaves lessons already created in place.

### Let LessonCue prepare videos for televisions

No converter setup is required after using the recommended installer; FFmpeg and FFprobe are included as server dependencies. Every new upload is inspected automatically. When a video is not in the broadly supported TV profile, LessonCue keeps the original and creates an H.264/AAC MP4 playback copy locally. Existing videos are inspected in the background after an update, so no re-upload is necessary. In **Media Library**, wait for **TV copy ready** or **TV ready** before relying on offline playback. A compatibility error remains visible there and can be retried with **Manage versions & impact → Reprocess metadata**.

Compatibility copies count toward the storage allocation. For reliable initial conversion, leave enough available capacity for the original plus a second video file. Neither the original nor its playback copy leaves the local server.

### Verify from SSH

```bash
sudo systemctl status lessoncue --no-pager
curl -fsS http://127.0.0.1/health && echo
curl -fsS http://127.0.0.1/.well-known/lessoncue && echo
sudo journalctl -u lessoncue -n 50 --no-pager
```

To follow the logs continuously, run `sudo journalctl -u lessoncue -f` and press `Ctrl+C` when finished.

### Enable registration and browser password recovery

The initial owner and accounts created under **Users** do not require email. To permit self-registration or browser password recovery, sign in with **Server settings** permission and open **Settings → Registration & email**. Configure Resend or Brevo, enter the public HTTPS address recipients can reach, and then choose closed, code-required, or open registration.

The provider key is encrypted on this server and is never returned to the browser. Preserve the complete `/var/lib/lessoncue/config` directory in disaster-recovery backups because it contains both the encrypted provider credential and the local encryption keys needed to use it. See [Accounts, registration, and email](account-self-service.md) for code management, expiry behavior, provider setup, and troubleshooting.

### Reset a forgotten administrator password

Password recovery stays local and requires SSH access to the server. First list the local administrator usernames:

```bash
sudo -u lessoncue env LESSONCUE_DATA_PATH=/var/lib/lessoncue \
  /opt/lessoncue/LessonCue.Server --list-admins
```

Reset the password for the required active username, replacing `YOUR_USERNAME`:

```bash
sudo -u lessoncue env LESSONCUE_DATA_PATH=/var/lib/lessoncue \
  /opt/lessoncue/LessonCue.Server --reset-password YOUR_USERNAME
```

Enter the new password twice when prompted. Nothing is shown while typing. The password must contain at least ten characters with uppercase, lowercase, and numeric characters. The command writes the normal ASP.NET password hash, records an audit event, and signs out that account's existing browser sessions. It does not display or recover the old password.

The web server can remain running during this operation. If the selected account is marked `disabled`, the password is still reset but another active owner must enable the account before it can sign in.

### Open LessonCue from another computer

Find the server's local address over SSH:

```bash
hostname -I | awk '{print "http://" $1}'
```

First try `http://lessoncue.local`, then use the printed numeric address if `.local` discovery is unavailable on that network. The complete LessonCue administration interface is served from the local server. It does not load or depend on the hosted prototype.

Do not forward LessonCue's HTTP port directly from the internet. Use the protected Cloudflare Tunnel option above or an administrator-managed VPN.

### Use the cellphone controller

Connect the phone to the same trusted Wi-Fi as the LessonCue server and TV. Open one of these addresses in Safari or Chrome, replacing `SERVER-IP` when needed:

```text
http://lessoncue.local/universalremote
http://SERVER-IP/universalremote
```

Sign in with a local LessonCue account. Choose the paired screen, choose a lesson, and use **Play lesson**, an individual media row, pause/resume, previous/next, stop, or seek. The television app must be open and paired; its status should say **Screen online** in the controller.

The native Android TV, Fire TV, and Apple TV interfaces also let an operator choose a lesson and scroll through every pre-roll, countdown, and lesson cue with the television remote's directional pad. Press the center/select button to play the focused item and Back/Menu to return to the lesson list. This browsing does not require the phone controller.

On iPhone or iPad, tap **Share**, then **Add to Home Screen**. On Android, open the browser menu and tap **Add to Home screen** or **Install app** when offered. This saves the local browser controller as an app-like icon; it does not install a separate LessonCue phone binary or connect to a hosted service.

### Use a computer or projector as a playback screen

Open **Screens** and select **Open browser player**, or browse directly to:

```text
http://lessoncue.local/player
http://SERVER-IP/player
```

Name the display, start pairing, and enter the six-digit PIN from **Screens**. The paired browser receives the same assigned manifests, phone-controller commands, acknowledgements, heartbeats, pre-roll, countdown, trims, fades, signage, and online media as a native TV client. Use `/player?kiosk=1` for the clean kiosk startup view. Select **Enter full screen**, then approve **Start browser playback** when the browser requests the first user gesture for audible media.

See the [browser playback client guide](browser-player.md) for keyboard and presentation-remote controls, kiosk startup, diagnostics, autoplay behavior, and recovery.

## Before you begin

Choose a server with:

- Windows 11 or a current 64-bit Linux distribution.
- 4 GB RAM minimum; 8 GB recommended for transcoding.
- Enough disk space for the original and processed media library.
- Ethernet when possible and a reserved DHCP address.
- TCP port 80, or the administrator-selected port, reachable by the trusted television network.

Install FFmpeg/FFprobe for media inspection and transcoding. Install LibreOffice headlessly only if PowerPoint conversion is required. Do not expose LessonCue directly to the public internet.

The Linux installer also installs the distribution's Intel media driver when available. On a server with a supported Intel integrated GPU, keep `/dev/dri` accessible to the `lessoncue` service and open **Settings → Adaptive TV playback → Check hardware**. “Quick Sync ready” means a real test encode passed. If the driver, GPU, or FFmpeg support is absent, LessonCue continues with software conversion automatically.

## Alternative: Docker

Docker is the quickest evaluation and technical-user installation.

```bash
git clone https://github.com/nickhighland/lessoncue.git
cd lessoncue
cp .env.example .env
docker compose up -d --build
docker compose logs -f lessoncue
```

To opt an Intel Docker host into Quick Sync, add the render devices to the service before starting it:

```yaml
services:
  lessoncue:
    devices:
      - /dev/dri:/dev/dri
```

Do not add this mapping on a host without `/dev/dri`; software conversion remains the portable default.

Open `http://SERVER-IP`. Data is stored in `./lessoncue-data` unless `LESSONCUE_DATA_PATH` is changed in `.env`. Docker uses the `LESSONCUE_HTTP_PORT` value in `.env` for its host port; recreate the container after changing it.

Docker bridge networking does not reliably publish mDNS. Use the numeric address or install the supplied `docker/avahi-service.xml` on the host. Native installation is friendlier for ordinary deployments.

## Manual Linux service installation

Download `LessonCue-Server-linux-x64.tar.gz` or `LessonCue-Server-linux-arm64.tar.gz` from the GitHub release, unpack it, and run:

```bash
sudo ./install.sh
```

The installer creates a restricted `lessoncue` account, installs the application at `/opt/lessoncue`, keeps data at `/var/lib/lessoncue`, registers the systemd service, opens port 80 when UFW is installed, and publishes the Avahi service when available. Running it again upgrades the application while preserving accounts, configuration, media, screen credentials, and backups. Upgrading an older installation preserves its current port; an administrator can switch it to port 80 afterward in Settings.

The release includes the architecture-matched `yt-dlp` helper used only when an operator explicitly chooses **Download YouTube locally**. FFmpeg inspects and thumbnails the resulting MP4. No separate Python or downloader installation is required.

Useful commands:

```bash
sudo systemctl status lessoncue
sudo journalctl -u lessoncue -f
sudo systemctl restart lessoncue
```

Run `sudo ./uninstall.sh` to remove the service. It deliberately preserves `/var/lib/lessoncue`.

## Windows service installation

Download and unpack `LessonCue-Server-Windows-x64.zip`, open PowerShell as Administrator, and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Install-LessonCue.ps1
```

The script installs an automatically starting Windows service, adds the firewall rule, and stores data in `C:\ProgramData\LessonCue`. `Uninstall-LessonCue.ps1` removes the service and application but preserves that data directory.

The browser port can be saved under **Settings → Connection & pairing**. On Windows, apply a changed port by opening PowerShell as Administrator, updating the matching Windows Firewall rule if necessary, and running `Restart-Service LessonCue`. Native Linux performs those steps automatically.

For password recovery, open PowerShell as Administrator and run:

```powershell
$env:LESSONCUE_DATA_PATH = "$env:ProgramData\LessonCue"
& "$env:ProgramFiles\LessonCue\LessonCue.Server.exe" --list-admins
& "$env:ProgramFiles\LessonCue\LessonCue.Server.exe" --reset-password YOUR_USERNAME
```

## First server check from another computer

Open these URLs from another computer on the television network, replacing `SERVER-IP` with the numeric address printed by the installer:

```text
http://SERVER-IP/health
http://SERVER-IP/.well-known/lessoncue
```

The first response should say `healthy`; the second should report the server identity and API version. The complete browser interface is at `http://SERVER-IP`.

## Android TV and Fire TV

For ordinary sideloading, download the production-signed APK from the same stable latest-release address:

```text
https://github.com/nickhighland/lessoncue/releases/latest/download/lessoncue-tv.apk
```

The matching test build remains available alongside it:

```text
https://github.com/nickhighland/lessoncue/releases/latest/download/LessonCue-AndroidTV-debug.apk
```

Use the debug build only for testing. Enable installation from unknown sources only for the file-manager or deployment tool you use, install the APK, then disable that permission again.

Updater-enabled production builds add **Check for updates** to the TV lesson library and perform a quiet background check at most once every 12 hours after a successful check. The first updater-enabled release must still be installed manually over the existing production app. Later releases can be downloaded and verified inside LessonCue; Android will ask once for **Allow from this source** and will always display its own final installation confirmation. LessonCue cannot and does not silently install updates.

On first launch:

1. Enter `http://lessoncue.local` or the numeric server address. Include `:PORT` only if an administrator selected a non-default port.
2. Enter the temporary six-digit pairing PIN.
3. Name and assign the screen in the server.
4. Leave the app open until its lesson reports ready for offline use.
5. Test with Wi-Fi disabled before the first live use.

Fire TV requires device-specific testing because background scheduling and storage behavior vary by Fire OS version.

## Apple TV

The tvOS app must be signed with an Apple Developer team before physical-device installation. Clone the repository on a Mac with current Xcode, install XcodeGen, and run:

```bash
brew install xcodegen
cd tvos
xcodegen generate
open LessonCueTV.xcodeproj
```

Select your development team, choose the Apple TV, and Run. Bonjour and local-network access prompts must be accepted. See [apple-tv.md](apple-tv.md) for store and device notes.

## Network checklist

- Put TVs and the server on the same VLAN, or explicitly route LessonCue's selected TCP port and mDNS between them.
- Disable wireless client isolation for the trusted device network.
- Avoid guest Wi-Fi.
- Reserve the server IP in DHCP and record its numeric URL.
- Allow `_lessoncue._tcp` multicast DNS where supported.
- Keep a local keyboard/mouse and the numeric server address available as a recovery path.

## Backups and updates

Owners can create and download a consistent configuration backup or a full backup from **Settings → Privacy & backups** while the server is running.

To restore a LessonCue ZIP from the browser, open **Settings → Privacy & backups → Restore a LessonCue backup**. LessonCue validates the archive and database without changing current data, shows the organization and record counts, and warns whether media is included. Type `RESTORE` only after reviewing that preview. LessonCue creates a full safety backup automatically, restores the database, restores media only when the uploaded archive is a full backup, and preserves the receiving server's identity, encryption keys, hostname, port, and pairing secrets. The staged upload expires after 24 hours.

Use a backup produced by the same or an older LessonCue release. A newer server automatically applies required database upgrades after restoration. A configuration backup preserves media already on the receiving server; use a full backup when moving media to another computer.

For a manual whole-server disaster-recovery copy, stop the service first and archive the entire data directory:

```bash
sudo systemctl stop lessoncue
sudo tar -C /var/lib -czf "lessoncue-manual-$(date +%Y%m%d).tar.gz" lessoncue
sudo systemctl start lessoncue
```

To restore that manual whole-directory archive, install the same or newer LessonCue version, stop the service, replace `/var/lib/lessoncue` with the saved directory contents, restore ownership with `sudo chown -R lessoncue:lessoncue /var/lib/lessoncue`, and start the service. Test restoration on a separate machine before relying on a backup policy.

For Docker, pull/build the new image and run `docker compose up -d`. Native Linux installations check for releases daily and alert signed-in users. A user with **Software updates** permission can use **Settings → Software updates → Install**; LessonCue verifies the release checksum, restarts, health-checks the new server, and rolls back the application files if that check fails. Run the two headless installation commands once on a server installed before version 0.4.0 to enable this protected updater. Application updates preserve `/var/lib/lessoncue`, including accounts, media, settings, pairing credentials, and backups.

In **Settings → Storage allocation**, a user with **Server settings** permission can choose a maximum amount of disk space or leave automatic allocation enabled. The page shows current LessonCue usage, free computer disk space, and the maximum safe allocation. LessonCue keeps a 512 MB safety reserve and refuses uploads that would exceed the allocation. Everyone with **Media uploads** permission can see the remaining upload capacity in the sidebar and Media Library. Uploads marked **For a lesson** are automatically removed four weeks after the latest lesson that uses them; uploads marked **Keep permanently** are not automatically removed.

Media can be assigned to hierarchical folders and comma-separated tags during upload or later in the Media Library. **Manage versions & impact** shows every lesson cue and sign that uses an item before replacement. Replacing a local file preserves its stable media ID, archives the current original, refreshes affected screen manifests, and queues fresh metadata and preview processing. Previous originals can be downloaded or restored as a new current version. Archived versions count against the storage allocation and are removed with their parent media when its retention period ends.

PDF, PowerPoint (`.pptx`), OpenDocument Presentation (`.odp`), and Word (`.docx`) uploads expose **Convert to slides** under **Manage versions & impact**. Keynote users should export to PDF first. Conversion runs entirely on the LessonCue computer through headless LibreOffice and Poppler, creates PNG media with a maximum 1920-pixel dimension, and never sends the document to a cloud service. Choose a lesson and seconds per slide after conversion. The recommended Linux installer and Docker image include both converters. For a manual Debian/Ubuntu install, run `sudo apt-get install -y libreoffice-impress libreoffice-writer poppler-utils`. On Windows, install LibreOffice system-wide, install a Poppler build, set the machine environment variable `LESSONCUE_PDFTOPPM_PATH` to `pdftoppm.exe`, and restart the LessonCue service.

To remove the headless Linux service while preserving its database and media:

```bash
sudo systemctl disable --now lessoncue
sudo systemctl disable --now lessoncue-update.path 2>/dev/null || true
sudo systemctl stop lessoncue-update 2>/dev/null || true
sudo rm -f /etc/systemd/system/lessoncue.service /etc/systemd/system/lessoncue-update.service /etc/systemd/system/lessoncue-update.path
sudo rm -f /usr/local/sbin/lessoncue-update
sudo rm -f /etc/avahi/services/lessoncue.service
sudo systemctl daemon-reload
sudo rm -rf /opt/lessoncue
echo "LessonCue data remains in /var/lib/lessoncue"
```
