# URL shortener and the short domain

LessonCue can sit in front of a [Shlink](https://shlink.io) instance so a short
domain works the way people expect: the bare domain goes somewhere useful, and
everything underneath it is a short link.

Nothing here is specific to one installation. The domain, the destination, and
the shortener's address are all settings.

## The shape of it

Two public hostnames, doing different jobs:

| Hostname | Points at | Serves |
| --- | --- | --- |
| the short domain, e.g. `go.example.org` | LessonCue | `/` itself; everything else is handed to Shlink |
| the shortener's own host, e.g. `short.go.example.org` | Shlink | Shlink's admin UI and REST API |

The short domain is routed to LessonCue rather than straight to Shlink because
the bare root needs different behaviour from every other path, and that is a
decision about one exact path. Sending the whole hostname somewhere else — a
Cloudflare redirect rule on the hostname, say — would take `/kids` and every
reserved game code with it.

For the same reason the root is **not** implemented as a short code with an
empty slug. It is handled before Shlink is consulted at all, so it cannot
shadow a real link.

## What happens to a request

```
https://go.example.org          ->  the configured destination
https://go.example.org/         ->  the configured destination
https://go.example.org/kids     ->  Shlink
https://go.example.org/Q7Z6     ->  Shlink, which sends the phone to the game
https://lesson.example.org/     ->  LessonCue, untouched
```

Only an exact `/` is LessonCue's. `/kids/` is a path, and belongs to Shlink.

Requests are forwarded with their original `Host` header, because Shlink
resolves short codes per domain — rewriting the host would make it look the
code up against the wrong one and miss a link that exists.

## Setting it up

**Settings → Integrations · URL shortener.**

- **Short domain** — the public short domain on its own, no path.
- **Where the shortener is reachable** — how LessonCue reaches Shlink from
  inside the deployment, e.g. `http://shlink:8080`.
- **Redirect the root short domain** — on by default. With it on, give a
  destination; with it off, choose what the bare root does instead: show
  Shlink's own page, serve LessonCue on the short domain, or return 404. Only
  the first of those is a redirect — the LessonCue option answers the request
  itself rather than sending the browser anywhere.
- **Carry the query string across** — on by default, so a printed
  `go.example.org/?source=poster` still arrives with its tracking intact.
- **Permanent redirect (301)** — off by default, and worth leaving off. A 302
  can be changed the moment you change this setting; a 301 is cached hard by
  browsers and proxies, and visitors who have already seen it may keep being
  sent to the old destination long afterwards. Turn it on once the destination
  is genuinely settled.

**Test** checks four things, because each can be true on its own while the
domain as a whole is broken: the domain answers, the root does what it was
configured to do, an ordinary short link still reaches Shlink, and a reserved
game code still resolves.

### What is rejected

- Anything that is not `http://` or `https://`. `javascript:`, `data:` and
  `file:` are excluded by only allowing the two, rather than by blocklist.
- A destination on the short domain itself, which would send the root back to
  the root until the browser gave up.

A plain-`http://` destination and a permanent redirect are both allowed, and
both say so when you save.

## Running Shlink

Shlink ships in `compose.yaml` behind a profile, so installations that do not
use short links never start it:

```bash
SHORT_DOMAIN=go.example.org docker compose --profile shortener up -d
```

| Variable | Purpose |
| --- | --- |
| `SHORT_DOMAIN` | the domain short links are minted on; required |
| `SHORTENER_HTTP_PORT` | host port for Shlink, default `8081` |
| `SHORTENER_DATA_PATH` | where Shlink keeps its SQLite database |
| `SHORTENER_GEOLITE_KEY` | optional, for geographic visit stats |

Then point the tunnel or reverse proxy at both hostnames: the short domain at
LessonCue, and the shortener's own hostname at Shlink's port.

## Reserved game codes

A game code works on the short domain the same way any short link does: create
a short URL in Shlink whose slug is the code and whose destination is the
LessonCue join address. Nothing about the root redirect touches it — that is
what the fourth check in **Test** is there to prove, and what the routing tests
assert for every possible root setting.
