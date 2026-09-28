# Handoff to Codex

Standing notes for whoever picks this repository up next. It is written for
Codex specifically, because most of the recent history alternates between Codex
and Claude and the expensive part has been each one rediscovering what the other
already knew.

**Keep this file current.** Update it in the same commit as the work it
describes, the way `CHANGELOG.md` is updated. If a section here is wrong, that
is a bug in the file — fix it rather than working around it.

Last reviewed: 2026-09-28, against `v0.46.27`.

---

## 1. Where things stand

| Component | Version | Notes |
| --- | --- | --- |
| Server (`csproj`) | 0.46.27 | matches the latest tag |
| `package.json` | 0.46.23 | **4 releases behind the tag** |
| `WebPlayer.tsx` `APP_VERSION` | 0.46.16 | **11 releases behind; this is what classroom screens display** |
| Android TV `versionName` | 0.46.7 | released on its own cadence |
| Vega `manifest.toml` | 0.46.6 | parked, see §4 |

The version drift is a recurring defect, not a one-off. `APP_VERSION` was
already found twelve releases stale at v0.46.0 and corrected then; it has drifted
eleven releases since. **Nothing checks it.** The cheapest fix is a test that
compares `APP_VERSION` and `package.json` against the server version and fails
the build on a mismatch — see §6.

## 2. Open pull requests

| PR | Branch | State |
| --- | --- | --- |
| #130 | `claude/games-activities-audit-z8fikj` | Games audit: 18 fixes with regression tests, 25 more documented. **Highest value open work.** |
| #109 | `vega-tv` | The Vega app **plus the offline lesson-media caching fix**. Green, unmerged. |
| #87 | `remove-stray-test-output` | Removes `run*.txt` committed by accident. |
| #117, #116, #114, #113, #112, #111, #127, #128, #129 | dependabot | routine |

Two things to know before touching these:

- **#109 is mis-bundled.** The offline media caching fix is wanted regardless of
  whether Vega ever ships, and it is currently gated behind a parked port. Split
  it out or merge the PR; do not close it as "Vega work".
- **#130 conflicts with unpushed Codex work.** Its author notes the brief it was
  written from describes code not on `main` (`OpeningRunId`, an offensive-name
  filter, a device-wide token fallback), with line numbers ~140 ahead — most
  likely a Codex working tree that was never pushed. Most of its fixes land in
  `ActivitySessionService.cs`. **If you are holding that tree, push or rebase it
  before #130 merges,** or expect to resolve conflicts in the busiest file in the
  activities subsystem.

## 3. Sound packs (changed 2026-09-28)

`web-admin/public/assets/games/` holds 29 packs — 28 engine folders plus
`shared` — each with 14 `.txt` placeholders, one per cue. The tree ships **no
audio**, and that is the supported default: every effect has a synthesized
fallback, and a missing theme means silence.

Resolution cascades **preset → engine → shared**, per cue, in
`resolveGameAudioChain`. `shared` is the pack to author first: it is the only one
consulted for every activity. An engine folder is an override, and only for the
cues it supplies — **a `.txt` is not an override, only a real `.mp3` is.**

Each placeholder now states which games reach it and which do not. Those
sections are generated, because they depend on the preset catalogue and on which
packs already ship an `.mp3`:

```
npm run audio:placeholders   # after adding an engine, a preset, or any .mp3
npm run audio:manifest       # after adding or removing any .mp3
```

`scripts/build-audio-placeholders.mjs` rewrites only the generated sections and
leaves the hand-written role/timing/character/spec notes alone. It is
idempotent. It parses `activityPresetRegistry.ts` with a regex rather than
importing it, because importing would pull the browser build into a build
script; it throws rather than writing "0 named games" if the catalogue's shape
changes, so a parse break fails loudly.

Known cosmetic issue left alone deliberately: the hand-written
`SUGGESTED CHARACTER` lines in some placeholders run to 135 characters. The
generator does not touch hand-written prose.

## 4. Parked: Amazon Vega

The Vega port builds for all three architectures, installs, launches in ~1.1 s,
runs in the foreground, mounts its React Native views, and executes its own
`probeServer` logic. **What has never been verified is what it draws** — no
screenshot was ever obtained.

Do not repeat the dead ends. `screencap` is absent (Android binary), the
emulator console has no screenshot command, `qemu monitor` is disabled, both
in-guest Wayland tools die on `creating a buffer file for N B failed: Permission
denied` (a sandbox refusal, not a size problem), and `vda root` is refused on
production builds.

**The route that works** is the QMP socket the device is launched with:
`-qemu -qmp unix:/tmp/qmp-socket-5554.sock,server,nowait`. QEMU 2.12, `screendump`
present, writes a valid `P6 1280 720 255` PPM host-side, bypassing the guest
allocator entirely. The remaining catch is `hw.gpu.mode = host`, so qemu's own
framebuffer is empty and every dump is pure black. Two untried fixes: the
emulator's `-grpc <port>` plus `EmulatorController.getScreenshot` (purpose-built,
works with the host renderer), or software rendering (`-gpu swiftshader_indirect`
/ `guest`) to force pixels into the framebuffer.

Operational traps: the VM dies with its launching shell unless started with
`start_new_session=True`; `virtualdevice` wants `-p <sdk>/vvd/instances` with
**no** `-n` flag; a stale Android `adb` on port 5037 makes the device invisible
to every Vega tool.

## 5. Conventions and commands

```
npm run typecheck:admin        npm run lint
npm run build:admin            npm run test:units
npm run test:e2e               npm run test:protocol
npm run test:amazon            npm run test:shortener
npm run audio:manifest         npm run audio:placeholders
```

Server tests are xUnit v3; the activities suite is the one that matters most and
is where #130 adds 21 regression tests. Browser tests are Playwright.

Two traps that have each cost a release:

- **Do not assert on a toast that a previous action already put on screen.**
  Two v0.45.1 builds failed this way: tests waited for "Activity saved." that was
  already showing from an earlier save. Wait for the request, not the banner.
- **Reading a JSON null through `TryGetInt32` throws**, producing a 500 with no
  message. This was fixed at ~30 call sites in v0.46.0 via `NumberOr()` in
  `ActivityValidation.cs`. Use the helpers.

## 6. Recommended next work

Ordered by value, not effort.

1. **Merge or split #109** so the offline media caching fix ships.
2. **Land #130**, resolving the `ActivitySessionService.cs` conflict first.
3. **Add a version-consistency test.** `APP_VERSION`, `package.json`, and the
   server version should not be able to drift. This has now recurred twice and
   is the single cheapest fix in this document.
4. **Ship a default sound pack.** The four audio cues added in v0.46.0 are
   inert — the plumbing exists, the placeholders now explain themselves, and no
   `.mp3` ships. A small set of licensed beds in `shared/` would make the feature
   real. Licensing requirements are in `docs/activities-assets-and-sound.md`.
5. **Separate per-game state from lobby state.** #130 names this its top
   improvement and traces four bugs to it (AUD-01, 05, 10, 23); independent work
   in `ActivitySessionService` reached the same conclusion.
6. **Extend the `zz-activity-sweep` pattern.** Playing all 28 engines on all
   three surfaces found a total outage (six uncreatable games) on its first run.
   Lesson cues and signage have no equivalent.

## 7. Security constraints that still apply

These were set by the repository owner and are not negotiable without asking:

- Never embed an administrator Shlink API key in `servers.json`, JavaScript,
  HTML, or Docker environment variables reaching browser-visible config. Never
  log it.
- Reserved codes are created through Shlink's REST API, never by direct database
  insert, and the list is not regenerated on each install.
- Do not expose PostgreSQL publicly. Keep container ports bound to the host
  where practical. HTTPS externally via Cloudflare.
- Cloudflare integration is additive: never replace the tunnel configuration
  wholesale, and preserve the catch-all rule.
- Validate every domain and redirect destination. Never impose a blanket rule
  such as "all four-character URLs are reserved".
- Destructive uninstall/reset stays behind explicit confirmation, and shortener
  configuration behind existing administrator permissions.
