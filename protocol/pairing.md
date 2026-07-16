# Pairing protocol

1. A TV calls `POST /api/v1/pairing/request` with its display name, platform, version, and optional public key.
2. The server returns a request identifier and expiry. The TV asks for the rotating six-digit PIN shown in the administration interface.
3. The TV calls `POST /api/v1/pairing/confirm` with the request identifier and PIN.
4. After approval, the server returns a screen identifier, a revocable device bearer token, branding, and the initial manifest.

The screen then posts `/api/v1/tv/status` throughout playback. `acknowledgedControlVersion` confirms the last command the player applied; the playback fields describe actual player state rather than the controller's requested state.

PINs expire after ten minutes, are rate-limited, and are stored only as password hashes. The returned device token is shown once and stored in the platform credential store.
