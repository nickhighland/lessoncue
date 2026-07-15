# Installing LessonCue

LessonCue is a local-network product. Install the server on a computer that remains at the church or school, connect the television devices to the same trusted network, and use a modern browser for administration.

## Before you begin

Choose a server with:

- Windows 11 or a current 64-bit Linux distribution.
- 4 GB RAM minimum; 8 GB recommended for transcoding.
- Enough disk space for the original and processed media library.
- Ethernet when possible and a reserved DHCP address.
- TCP port 8080 reachable by the trusted television network.

Install FFmpeg/FFprobe for media inspection and transcoding. Install LibreOffice headlessly only if PowerPoint conversion is required. Do not expose port 8080 directly to the public internet.

## Option A: Docker

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

## Option B: Linux service

Download `LessonCue-Server-Linux-x64.tar.gz` or `LessonCue-Server-Linux-arm64.tar.gz` from the GitHub release, unpack it, and run:

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

## Option C: Windows service

Download and unpack `LessonCue-Server-Windows-x64.zip`, open PowerShell as Administrator, and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Install-LessonCue.ps1
```

The script installs an automatically starting Windows service, adds the firewall rule, and stores data in `C:\ProgramData\LessonCue`. `Uninstall-LessonCue.ps1` removes the service and application but preserves that data directory.

## First server check

Open these URLs from another computer on the television network:

```text
http://SERVER-IP:8080/health
http://SERVER-IP:8080/.well-known/lessoncue
```

The first response should say `healthy`; the second should report the server identity and API version. The initial pairing PIN is printed to the service log. Change the development PIN in `appsettings.json` before a real deployment and restrict log access.

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

For Docker, pull/build the new image and run `docker compose up -d`. For native installations, back up data, unpack the new release, and rerun the installer. Installers never delete media automatically.
