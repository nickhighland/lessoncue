# Installing LessonCue

LessonCue is a local-network product. Install the server on a computer that remains at the church or school, connect the television devices to the same trusted network, and use a modern browser on another computer for administration.

## Recommended: headless Ubuntu or Debian server over SSH

These instructions are for a 64-bit Ubuntu or Debian server with no desktop or GUI installed. The server needs internet access during installation, a non-root SSH account with `sudo`, and a static or DHCP-reserved local IP address.

SSH into the server from your computer:

```bash
ssh YOUR_USERNAME@SERVER_IP
```

Paste this entire block into the SSH session. It detects Intel/AMD versus ARM64, downloads the latest LessonCue release, installs required packages, registers the systemd service, and starts it:

```bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y curl ca-certificates ffmpeg avahi-daemon libicu-dev zlib1g openssl

case "$(uname -m)" in
  x86_64|amd64) LESSONCUE_RUNTIME="linux-x64" ;;
  aarch64|arm64) LESSONCUE_RUNTIME="linux-arm64" ;;
  *) echo "Unsupported CPU architecture: $(uname -m)"; exit 1 ;;
esac

LESSONCUE_VERSION="$(curl -fsSL -o /dev/null -w '%{url_effective}' \
  https://github.com/nickhighland/lessoncue/releases/latest | awk -F/ '{print $NF}')"
LESSONCUE_WORKDIR="$(mktemp -d)"

curl -fL \
  "https://github.com/nickhighland/lessoncue/releases/download/${LESSONCUE_VERSION}/LessonCue-Server-${LESSONCUE_RUNTIME}.tar.gz" \
  -o "${LESSONCUE_WORKDIR}/lessoncue.tar.gz"

tar -xzf "${LESSONCUE_WORKDIR}/lessoncue.tar.gz" -C "${LESSONCUE_WORKDIR}"
sudo "${LESSONCUE_WORKDIR}/install.sh"

cd /
rm -rf "${LESSONCUE_WORKDIR}"

if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 8080/tcp
fi

SERVER_IP="$(hostname -I | awk '{print $1}')"
echo "LessonCue is installed at http://${SERVER_IP}:8080"
curl -fsS "http://127.0.0.1:8080/health"
echo
```

The final health response should contain `"status":"healthy"`. The SSH connection can now be closed; systemd keeps LessonCue running and starts it again after reboot.

### Set a private pairing PIN

The foundation release ships with a development PIN. Paste this block once to replace it with a random six-digit PIN:

```bash
set -euo pipefail
PAIRING_PIN="$(od -An -N4 -tu4 /dev/urandom | awk '{printf "%06d", $1 % 1000000}')"
sudo sed -i -E \
  "s/(\"PairingPin\"[[:space:]]*:[[:space:]]*\")[0-9]{6}(\")/\1${PAIRING_PIN}\2/" \
  /opt/lessoncue/appsettings.json
sudo systemctl restart lessoncue
echo "LessonCue pairing PIN: ${PAIRING_PIN}"
```

Save that PIN in your password manager. To rotate it, paste the same block again.

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

Open the printed address from a browser on the same local network. The current v0.1.0 server displays its API status at that address. The interactive administration experience is available at [lessoncue-media.nick247475.chatgpt.site](https://lessoncue-media.nick247475.chatgpt.site/) and is not yet embedded into the local server release.

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

The installer creates a restricted `lessoncue` account, installs the application at `/opt/lessoncue`, keeps data at `/var/lib/lessoncue`, registers the systemd service, opens port 8080 when UFW is installed, and publishes the Avahi service when available.

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

The first response should say `healthy`; the second should report the server identity and API version. Change the development PIN in `/opt/lessoncue/appsettings.json` before a real deployment and restrict log access.

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

Stop the server or use SQLite's online backup support before copying live database files. Back up the entire data directory, especially `database`, `media`, `branding`, and `config`. Test restoration on a separate machine.

For Docker, pull/build the new image and run `docker compose up -d`. For native installations, back up data and repeat the headless installation block; the installer replaces the application but preserves `/var/lib/lessoncue`. Reapply or rotate the pairing PIN after an update. Installers never delete media automatically.

To remove the headless Linux service while preserving its database and media:

```bash
sudo systemctl disable --now lessoncue
sudo rm -f /etc/systemd/system/lessoncue.service
sudo rm -f /etc/avahi/services/lessoncue.service
sudo systemctl daemon-reload
sudo rm -rf /opt/lessoncue
echo "LessonCue data remains in /var/lib/lessoncue"
```
