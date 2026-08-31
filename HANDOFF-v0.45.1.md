# LessonCue v0.45.1 — handoff for Codex

Everything below is merged to `main` and tagged `v0.45.1`. The tag is built and
waiting at the `production-release` approval gate; nothing is published yet.

Base for comparison: `v0.45.0`. Range: `git log v0.45.0..v0.45.1`.

    cd829c1  Make the shortener install work on a server, and keep the game codes out of its console (#82)
    9151139  Find the reserved codes in the case the shortener stores them, and put a password in front of the console (#83)
    8b3b350  Release v0.45.1 (#84)
    1f2e93e  write the editor's draft when it changes, not a tick later (#85)
    990f40d  stop the activity helper returning before the editor is done (#86)

One follow-up is open and NOT in the tag: [#87](https://github.com/nickhighland/lessoncue/pull/87),
removing four stray `run*.txt` Playwright logs committed by accident in #85.

---

## 1. The shortener installer did not work on a real server

Four faults, each hidden behind the last. None were findable by reading the
code; all were found by running it against real Docker and real Shlink.

**`scripts/shortener-install.sh`, `scripts/shortener-update.sh`**

- They did `cd "$(dirname "$0")/.."` to find `compose.yaml`. Correct in the
  repository, where they live in `scripts/`; wrong in the release bundle, which
  flattens them **beside** it. Every real install ran in `/opt`, found no
  compose file, and reported only "the shortener did not start". They now
  locate the compose file instead of assuming a depth.
- `SHORT_DOMAIN` was exported into one shell and written nowhere, so every later
  `docker compose` command failed with `required variable SHORT_DOMAIN is
  missing a value`. Now written to `.env`, preserving keys the operator set.
- A bare `up` also started the `lessoncue` service, which has no build context
  in the bundle and, on a native install, already serves port 80. The installer
  names the four services it owns.
- Both secrets were `-rw------- root`. Postgres runs as root and read its
  password fine — which made the database go healthy and disguised this as a
  Shlink problem. Shlink runs as uid 1001 and restart-looped on
  `file_get_contents(/run/secrets/shortener_db_password): Permission denied`.
  LessonCue could not read its integration key either: that directory took its
  owner from the **data root** (root-owned) rather than the config directory
  beside it. Both are now readable by their consumers, inside directories that
  are not.

**`compose.yaml`**

- Healthchecks pin `127.0.0.1`, not `localhost`. Inside these images `localhost`
  resolves to `::1` alone while the servers bind IPv4; `curl` falls back and
  `wget` does not, so the console reported itself down while serving fine.

**`scripts/check-shortener-compose.mjs`**

- Now *runs* the installer against a stub `docker` in both layouts and asserts
  where it ran, which services it started, that it recorded `SHORT_DOMAIN`, and
  that the secrets are readable by an unprivileged user. Each fix was verified
  to fail this check when reverted. Reading the `cd` line is what missed it.

## 2. Reserved codes reported as "owned by someone else"

**`server/LessonCue.Server/Shortener/ShlinkClient.cs`,
`ReservedCodeProvisioner.cs`**

`SHORT_URL_MODE=loose` lets a player type a code in any case — and it also
**lower-cases a custom slug as it stores it**, while lookup by slug stays exact.
Confirmed against Shlink 4.4.6:

    GET  /rest/v3/short-urls/Z8F2  -> 404
    GET  /rest/v3/short-urls/z8f2  -> 200
    POST customSlug=Z8F2           -> 400 "Provided slug \"z8f2\" is already in use."

So LessonCue created all hundred codes, never found one again, called them
missing, tried to recreate them, was refused, and surfaced the conflict as
"owned by someone else" — every three minutes, forever.

- `FindAsync` falls back to the lower-cased slug (also covers strict mode).
- A repair addresses `existing.ShortCode`, the slug as stored.
- The stand-in shortener in `ReservedCodeProvisionerTests` now lower-cases slugs
  the way the real one does. Three tests fail without the fix.

Short links themselves were never affected: `chroc.cc/Z8F2`, `/z8f2` and
`/Z8f2` all 302 correctly.

## 3. A password gate in front of the Shlink console

The console is a browser page with no login of its own, so on a public hostname
anyone who finds the address is already inside it.

- **`compose.yaml`**: new `shlink-web-gate` service (nginx), and
  `shlink-web-client` no longer publishes a port — it is `expose` only. The gate
  takes the port the console had, so an existing tunnel route is untouched. The
  nginx config is written at container start inside the compose `command` rather
  than shipped as a second file, because a second path is a second thing to get
  wrong in the bundle layout. Note `$$host` — compose would read `$host`.
  `/healthz` sits outside the password, or Docker reports a working gate as down.
- **`ShortenerService.SetConsolePasswordAsync`** writes the htpasswd line
  (`admin:{SHA}base64(sha1(password))`, min 8 chars). nginx reads the file per
  request, so a change applies to the next visit with nothing restarting.
- **`PUT /api/v1/shortener/console-password`**, audited as
  `shortener.console.password`. The password is never recorded anywhere.
- Status now carries `consolePasswordSet` and `consoleUser`.
- The installer writes the file **locked** — a hash of something nobody knows —
  so the console is unreachable until a password is chosen, rather than open
  until somebody gets round to it.

This is a gate, not a vault: one shared account over HTTPS, hashed the only way
that file format offers. Cloudflare Access is the stronger option and is still
recommended in the docs.

## 4. Reserved codes hidden from the console

Shlink scopes an API key to short URLs it created itself
(`api-key:generate --author-only`). The installer mints a second key with that
role; `ShortenerService.ConsoleKey` exposes it and
`POST /shortener/key/reveal` hands over **that** key rather than the
administrator key, returning `{ apiKey, scope }`.

Measured on a real server: console key sees 0 short URLs, LessonCue's sees 100.
An admin key will always see them — Shlink has no per-link hide flag.

## 5. Short domain as a join-address option

**`ActivityJoinAddressService`, `ActivitySessionService`, `Settings.tsx`**

The shortener previously **took over** the join address whenever it was running,
overriding whatever the teacher had chosen.

- New `ModeShortener = "shortener"` alongside `auto`/`cloudflare`/`local`/`lan`.
  Listed even when no shortener exists, with guidance. `auto` prefers it when
  short links resolve.
- The decision now lives in `ResolveJoinUrl`, so `ActivitySessionService` no
  longer overrides the room's setting. Both call sites simplified.
- **The case that matters:** a game started while the shortener was down has an
  ordinary six-character code the short domain does not carry. Those runs fall
  back to an ordinary address regardless of the chosen mode, so a wall never
  shows a dead link. Tested.
- The service takes a new `IShortJoinAddress` interface rather than
  `ShortenerService` itself — building a real one needs a database, and that
  awkward case is the one worth testing.
- UI: the "Players will see" preview drops `/play` for the short domain, which
  carries the code directly; the fallback banner shows an option label rather
  than a raw mode id.

## 6. Backups leaked the shortener's admin key

**`BackupService.SensitiveConfigFiles`** named only files at the top of
`config/`, while the installer writes its keys one directory down. A backup
taken "without secrets" carried the administrator key. Added
`shortener/integration-key` and `shortener/console-key`. The test fails without
the fix.

## 7. Adaptive transcode 500 on a lost race

**`AdaptiveTranscodeService.SaveQueuedAsync`**, used by
`POST /media/{id}/transcodes/{profile}`.

Queueing reads before it writes, and the administrator's request is not the only
writer — the screen prewarm queues the same profiles from its own context. Both
find nothing, both insert, and the unique index on `(media, profile)` turned the
loser into a 500 for work the winner had already scheduled. Saving now drops
only the rows another writer got to first. A constraint failure that is *not* a
duplicate profile still surfaces; there is a test for each.

## 8. Activity editor draft handling

**`ActivityLibrary.tsx`** — every draft write (`commitName`,
`commitDescription`, `commitConfig`, `commitTheme`, `commitDraft`) sets
`draftRef.current` in the same handler as the state. Previously the ref was
written in a `useEffect`, which runs after commit, so a save pressed before
React flushed read the draft from before the change. Two handlers also rebuilt
values from their closure's copy of the config and now read the ref.

**`tests/browser/zz-activity-games.spec.ts`** — the `createActivity` helper
waited for the save's PUT response and returned, but the response arriving is
not the client having finished: `handleSaveEdit` still re-seeds the editor from
what the server stored. The next step interleaved with that continuation, a
preset applied in between was replaced by the server's older copy, and the test
saved the preset it thought it had chosen. **This was the actual cause of two
failed release builds.** The helper now waits for the editor to report it is
done.

### Deliberately not shipped

A guard in `handleSaveEdit` that adopts the server's reply only when
`draftRef.current === draft` (i.e. nothing was edited while the request was in
flight). It is logically sound — a save's reply should not overwrite newer
edits — but a test that held the response open for two seconds passed **with and
without** it, so the bug could not be shown to be reachable. It was reverted
rather than shipped into a release that had already failed twice on that file.
**If you pick this up, it needs a test that fails without it.**

## 9. Running your own Shlink build

`SHORTENER_UI_IMAGE` now parameterises the console image, as `SHORTENER_IMAGE`
already did for the API. Neither image is built from this repository — both come
from `ghcr.io/shlinkio`. Shlink is MIT (verified from the image's own LICENSE).
Documented in `docs/url-shortener.md`, including the REST surface LessonCue
depends on (`rest/v3/short-urls`, `rest/health`, custom slugs, the
`lessoncue-reserved` tag) that a fork must keep working.

---

## Verification status

- 516 server tests, 119 browser tests, protocol contract, compose guard, shell
  syntax, typecheck, lint, Android build.
- The installer, the gate, the reserved codes, the console key scoping and
  reboot survival were each exercised **against a real server** (Debian 13,
  Shlink 4.4.6, Postgres 17.6), not reasoned about.
- Reboot survival was proven by stopping and starting the Docker daemon: all
  three containers returned in ~5s and both endpoints answered 200.

## Caveats worth carrying

- The `SHORTENER_UI_API_KEY` route (baking the scoped key into the console page)
  is left **empty by default** on purpose. It is safe only while the console is
  not publicly routed, or is behind Cloudflare Access.
- The release build failed twice before succeeding, both times in
  `release-validation` on `zz-activity-games.spec.ts` under load. Two earlier
  diagnoses of mine were wrong before the helper race was found. If that file
  fails again, suspect test/client interleaving before suspecting product logic.
