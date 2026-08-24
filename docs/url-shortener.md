# URL shortener

LessonCue can optionally run a self-hosted [Shlink](https://shlink.io) on the
same server, giving the organization a short domain of its own and giving games
a set of short, readable join codes.

It is optional in the strong sense. An installation that never turns it on runs
exactly as before, and one that turns it on and later loses it keeps working —
short links stop, nothing else does.

Nothing here is specific to any installation. The short domain, the management
address, and the root destination are all configuration.

## The shape of it

Four containers, behind a compose profile:

```
Cloudflare Tunnel
│
├── lessoncue.example.org  ──▶  LessonCue
├── go.example.org         ──▶  Shlink              short links and game codes
└── short.go.example.org   ──▶  Shlink Web Client   the management console
                                     │
                                Shlink ──▶ PostgreSQL   (never published)
```

The short domain goes **straight to Shlink**. LessonCue is not in that path, and
does not proxy it — Shlink answers its own root natively, so putting anything in
front of it would only add a hop that can fail.

The management console is a different hostname from the short domain. One serves
links to the public, the other serves an administrator's console; short links
always stay on `https://{SHORT_DOMAIN}/{slug}` and never move to the management
host.

## What the addresses do

```
https://go.example.org           the root destination you configured
https://go.example.org/kids      an ordinary short link
https://go.example.org/give      an ordinary short link
https://go.example.org/Q7Z6      a LessonCue game
https://short.go.example.org     the management console
```

## Game codes

LessonCue reserves exactly **100** four-character codes, shipped as
`reserved-game-codes-v1.json`. Each is a letter, a digit, a letter, a digit,
drawn from an alphabet with `0`, `1`, `I`, `L` and `O` left out so a room can
read one off a television without arguing about it.

The shape also keeps them clear of the words an organization actually wants:
`/kids`, `/give`, `/easter` and `/register` stay available, while `/Q7Z6` is
obviously a game. Only those exact hundred slugs are reserved — four-character
short links in general are not.

**The links are permanent.** `/Q7Z6` always points at LessonCue's join page for
`Q7Z6`. A game starting or ending never touches Shlink; all that changes is
whether a session currently owns that code. When none does, the join page says
so in its usual way. When a later game takes it, the same link works again.

Codes are handed out at random from those not currently in use, so a room that
meets weekly cannot guess next week's from last week's. If all hundred are in
play at once, a new game falls back to an ordinary six-character code: it will
not work on the short domain, but the lesson still runs.

Shlink runs in **loose** mode, so `go.example.org/q7z6` reaches the game shown
as `Q7Z6` on screen.

## Setting it up

Installing it is a deliberate act — nothing below runs otherwise.

### 1. Start the stack

```bash
scripts/shortener-install.sh go.example.org
```

That generates the database password and LessonCue's own API key, starts the
four containers, waits for the shortener to answer, and prints the tunnel routes
to add. Run it again any time: existing secrets and data are kept, so it repairs
a half-finished install rather than starting over.

To do it by hand instead:

```bash
SHORT_DOMAIN=go.example.org docker compose --profile shortener up -d
```

| Variable | Purpose |
| --- | --- |
| `SHORT_DOMAIN` | the domain short links are minted on; required |
| `SHORTENER_HTTP_PORT` | local port for Shlink, default `8081` |
| `SHORTENER_UI_PORT` | local port for the console, default `8082` |
| `SHORTENER_DB_PATH` | where PostgreSQL keeps its data |
| `SHORT_DOMAIN_ROOT_REDIRECT` | where the bare domain goes; empty leaves Shlink's own page |
| `SHORTENER_GEOLITE_KEY` | optional, for geographic visit statistics |

Both published ports bind to loopback, and PostgreSQL is not published at all —
the tunnel is the only way in from outside.

The settings card also carries the Cloudflare routes for this installation —
the exact hostnames and ports to add — and shows them before a domain is even
chosen, so the shape is clear up front.

### 2. Add two tunnel routes

Reuse the tunnel already serving LessonCue. In Cloudflare Zero Trust →
Networks → Tunnels → your tunnel → **Public Hostnames**, add:

| Hostname | Service |
| --- | --- |
| `{SHORT_DOMAIN}` | `http://localhost:8081` |
| `{SHORTENER_ADMIN_HOST}` | `http://localhost:8082` |

Keep the entry pointing at LessonCue itself. If the short domain already has an
entry from **v0.41.0**, where LessonCue fronted it, change that entry's service
rather than adding a second — a tunnel holds one entry per hostname, and leaving
the old one would keep every short link going to LessonCue. Leave unrelated
entries alone. Cloudflare creates the DNS records itself when the domain is in
the same account.

**Do not add a Redirect Rule for the short domain.** A rule on the whole
hostname would also catch `/kids` and every game code underneath it.

LessonCue holds a tunnel connector token rather than a Cloudflare API token, so
it cannot add these routes for you. Settings shows the exact entries to add,
with this installation's own hostnames and ports.

### 3. Configure LessonCue

**Settings → Integrations · URL shortener.**

- **Short domain** — bare, no scheme.
- **Management address** — follows the short domain as you type it
  (`short.{SHORT_DOMAIN}`), and can be overridden for installations without DNS
  control over that name. It may not be the short domain itself.
- **Where the shortener is reachable** — filled in for you. Which address is
  right depends on how LessonCue itself runs, which is why it is not a fixed
  value: inside the compose stack the shortener is another container
  (`http://shlink:8080`, its *internal* port), while a native install reaches it
  through the published one (`http://127.0.0.1:8081`). Note `127.0.0.1` inside
  LessonCue's container is LessonCue, not the shortener.
- **When someone visits the bare short domain** — the shortener's own page, the
  organization's website, LessonCue, or somewhere else. Shlink serves that root
  and reads the destination from `SHORT_DOMAIN_ROOT_REDIRECT` at start-up, so
  the card shows the value to set and the container needs restarting for a
  change to take effect.
- **Use short-domain links for game codes** — what makes games hand out
  reserved codes and show the short link.

Then **Issue API keys**, and **Repair reserved codes** to create all hundred.

### API keys

LessonCue **records** the shortener's key; it cannot create one. Shlink has no
API for minting keys, so anything LessonCue generated would simply be rejected.

The installer generates one key, starts Shlink with it, and writes it where
LessonCue can read it — so there is normally nothing to do here. If the
shortener runs somewhere LessonCue cannot read that file, or you rotate the
key, paste it into the settings card instead. Generate another with:

```bash
docker compose exec shlink shlink api-key:generate
```

Use a separate key for your own work in the console, so LessonCue's routine
provisioning is never done with a person's credential.

The web client is deployed with no server list and no key. It is a static page
served to a browser, so anything baked in there would be handed to whoever
opens it.

## Keeping it honest

LessonCue re-checks the reserved codes and repairs what has drifted:

- A missing code is recreated.
- A code pointing at the wrong place — usually because LessonCue's public
  address changed — is repaired in place, so its visit history survives.
- A code that exists but belongs to someone else is **not** taken over. The
  integration reports as degraded and names the conflicting code, so an
  administrator can delete or rename that link and repair again.

## Backups

LessonCue's own backup covers the shortener's *configuration* and the
reserved-pool version, because both live in its database. The API keys are
treated as secrets and are left out of a backup taken without them.

**Shlink's database is not included** — it lives in its own container volume,
outside LessonCue's data path. Back it up separately:

```bash
docker compose exec shlink-db pg_dump -U shlink shlink > shlink-backup.sql
```

Ordinary organization short links cannot be recreated from anything LessonCue
holds, so this matters.

## Turning it off

Three distinct actions:

- **Stop using short links** — LessonCue goes back to its own join addresses.
  Shlink keeps running and every link keeps working.
- **Stop the containers** — `docker compose --profile shortener down`. The
  database, configuration and volumes are all retained.
- **Remove the integration** — LessonCue clears its settings and forgets its
  credentials. It does not touch Shlink's database: those links belong to the
  organization, and deleting them is a separate, deliberate act.

## Updating

The Shlink image is pinned, never `latest` — an unattended major bump would
migrate the database out from under the links the organization depends on.

```bash
scripts/shortener-update.sh 4.5.0
```

It refuses to start unless the shortener is currently healthy, dumps the
database first, counts the reserved codes before and after, and waits for the
migration to finish. If the count changes, use **Repair reserved codes**. If it
never comes back healthy, the dump and the previous tag are both there to go
back to.

Run it with no tag to see the running version and the reserved count without
changing anything.
