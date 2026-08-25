# Companion web workspace

This is a separate UI/auth service for an existing Shlink installation. It does not modify Shlink routes, database
tables, redirect behavior, or API behavior.

## Configuration

Set these environment variables before starting the service:

```text
SHLINK_API_URL=https://links.example/rest/v3
SHLINK_API_KEY=replace-with-a-server-side-api-key
# Optional public base shown before custom aliases.
SHLINK_SHORT_URL_BASE=https://short.com/
```

The API URL may also be a Shlink server URL without `/rest/v3`; the companion adds that path automatically. The API key
is sent only from this service to Shlink. `SHLINK_API_KEY_FILE` is also supported for mounted secrets. If the public base
is omitted, the companion uses Shlink's configured default domain when available and otherwise derives it from the API URL.

Optional UI settings are available through environment variables:

```text
COMPANION_APP_NAME=Link Shortener
COMPANION_ACCENT_COLOR=#86E7B7
COMPANION_MAIN_COLOR=#101827
COMPANION_ADMIN_PASSWORD=use-a-long-password
COMPANION_USER_PASSWORD=use-a-different-long-password
```

For containers and secret managers, use the `_FILE` variants. If passwords are omitted, the first visit opens the setup
screen. Later branding, feature switches, and password changes are saved to `data/ui-config.json`.

LessonCue deployments may set `COMPANION_PASSWORD_RESET_FILE` to a private,
one-shot JSON file containing `adminPassword` and `userPassword`. The companion
consumes it into the same stored hashes used by the Access & brand screen. Do
not combine that integration with permanent `COMPANION_ADMIN_PASSWORD` or
`COMPANION_USER_PASSWORD` environment variables, because environment values
intentionally take precedence over the stored settings.

## Local run

From the repository root:

```sh
SHLINK_API_URL=http://127.0.0.1:8080/rest/v3 \
SHLINK_API_KEY=your-api-key \
php -S 127.0.0.1:8090 -t companion/public companion/public/index.php
```

Open `http://127.0.0.1:8090/`. Use HTTPS in production, and keep the companion's `data` directory private and writable
by its PHP process.
