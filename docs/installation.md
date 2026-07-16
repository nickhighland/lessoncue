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

The final message says `LessonCue is ready` and prints an address such as `http://192.168.4.75:8080`. The SSH connection can then be closed; systemd keeps LessonCue running and starts it again after reboot.

### First browser setup

On a computer connected to the same local network, open the address printed by the installer. LessonCue will ask you to create the organization name, administrator username, and password. This account, the complete web interface, database, schedules, and media all remain on your local server.

LessonCue creates a private local pairing secret and displays a six-digit PIN that rotates every ten minutes. After signing in, find the current PIN on the Dashboard and Screens pages.

### Verify from SSH

```bash
sudo systemctl status lessoncue --no-pager
curl -fsS http://127.0.0.1:8080/health && echo
curl -fsS http://127.0.0.1:8080/.well-known/lessoncue && echo
sudo journalctl -u lessoncue -n 50 --no-pager
```

To follow the logs continuously, run `sudo journalctl -u lessoncue -f` and press `Ctrl+C` when finished.

### Open LessonCue from another computer

Find the server's local address over SSH:

```bash
hostname -I | awk '{print "http://" $1 ":8080"}'
```

Open the printed address from a browser on the same local network. The complete LessonCue administration interface is served from that local address. It does not load or depend on the hosted prototype.

Do not forward port 8080 from the internet. Use a VPN for remote access.

## Before you begin

Choose a server with:

- Windows 11 or a current 64-bit Linux distribution.
- 4 GB RAM minimum; 8 GB recommended for transcoding.
- Enough disk space for the original and processed media library.
- Ethernet when possible and a reserved DHCP address.
- TCP port 8080 reachable by the trusted television network.

Install FFmpeg/FFprobe for media inspection and transcoding. Install LibreOffice headlessly only if PowerPoint conversion is required. Do not expose port 8080 directly to the public internet.

## Alternative: Docker

Docker is the quickest evaluation and technical-user installation.

```bash
git clone https://github.com/nickhighland/lessoncue.git
cd lessoncue
cp .env.example .env
docker compose up -d --build
docker compose logs -f lessoncue
```

Open `http://SERVER-IP:8080`. Data is stored in `./lessoncue-data` unless `LESSONCUE_DATA_PATH` is changed in `.env`.

Docker bridge networking does not reliably publish mDNS. Use the numeric address or install the supplied `docker/avahi-service.xml` on the host. Native installation is friendlier for ordinary deployments.

## Manual Linux service installation

Download `LessonCue-Server-linux-x64.tar.gz` or `LessonCue-Server-linux-arm64.tar.gz` from the GitHub release, unpack it, and run:

```bash
sudo ./install.sh
```

The installer creates a restricted `lessoncue` account, installs the application at `/opt/lessoncue`, keeps data at `/var/lib/lessoncue`, registers the systemd service, opens port 8080 when UFW is installed, and publishes the Avahi service when available. Running it again upgrades the application while preserving accounts, configuration, media, screen credentials, and backups.

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

## First server check from another computer

Open these URLs from another computer on the television network, replacing `SERVER-IP` with the numeric address printed by the installer:

```text
http://SERVER-IP:8080/health
http://SERVER-IP:8080/.well-known/lessoncue
```

The first response should say `healthy`; the second should report the server identity and API version. The complete browser interface is at `http://SERVER-IP:8080`.

## Android TV and Fire TV

Download `LessonCue-AndroidTV-debug.apk` from a workflow artifact or release. Enable installation from unknown sources only for the file-manager or deployment tool you use, install the APK, then disable that permission again. For managed or store distribution, build a signed release APK/AAB with your own keystore.

On first launch:

1. Enter `http://lessoncue.local:8080` or the numeric server address.
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

- Put TVs and the server on the same VLAN, or explicitly route TCP 8080 and mDNS between them.
- Disable wireless client isolation for the trusted device network.
- Avoid guest Wi-Fi.
- Reserve the server IP in DHCP and record its numeric URL.
- Allow `_lessoncue._tcp` multicast DNS where supported.
- Keep a local keyboard/mouse and the numeric server address available as a recovery path.

## Backups and updates

Owners can create and download a consistent configuration backup or a full backup from **Settings → Privacy & backups** while the server is running. For a manual disaster-recovery copy, stop the service first and archive the entire data directory:

```bash
sudo systemctl stop lessoncue
sudo tar -C /var/lib -czf "lessoncue-manual-$(date +%Y%m%d).tar.gz" lessoncue
sudo systemctl start lessoncue
```

To restore, install the same or newer LessonCue version, stop the service, replace `/var/lib/lessoncue` with the saved directory contents, restore ownership with `sudo chown -R lessoncue:lessoncue /var/lib/lessoncue`, and start the service. Test restoration on a separate machine before relying on a backup policy.

For Docker, pull/build the new image and run `docker compose up -d`. Native Linux installations check for releases daily and alert signed-in users. An owner or administrator can use **Settings → Software updates → Install**; LessonCue verifies the release checksum, restarts, health-checks the new server, and rolls back the application files if that check fails. Run the two headless installation commands once on a server installed before version 0.4.0 to enable this protected updater. Application updates preserve `/var/lib/lessoncue`, including accounts, media, settings, pairing credentials, and backups.

In **Settings → Storage allocation**, an owner or administrator can choose a maximum amount of disk space or leave automatic allocation enabled. The page shows current LessonCue usage, free computer disk space, and the maximum safe allocation. LessonCue keeps a 512 MB safety reserve and refuses uploads that would exceed the allocation. Editors and administrators can always see the remaining upload capacity in the sidebar and Media Library. Uploads marked **For a lesson** are automatically removed four weeks after the latest lesson that uses them; uploads marked **Keep permanently** are not automatically removed.

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
