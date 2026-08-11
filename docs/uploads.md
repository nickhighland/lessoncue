# Resumable uploads and storage limits

Every browser upload, regardless of file size, uses the same persisted upload-session protocol. LessonCue records the owner, declared byte length, exact chunk count, received-chunk bitmap, retention destination, creation/update/expiration times, optional expected SHA-256, calculated content SHA-256, and final media identifier in SQLite.

## Interruption and recovery

- A session reserves its complete declared size before accepting its first byte.
- The browser sends exact 8 MiB chunks and retries transient failures four times with bounded backoff.
- Choosing **Pause upload** stops the browser and marks the server session paused. **Resume upload** continues only the missing chunks.
- Choosing **Cancel upload** deletes partial files and releases the reservation.
- A network/browser interruption leaves the session available for 24 hours. Selecting the same file and upload destination again resumes its missing chunks.
- The background cleanup service expires inactive sessions, deletes their partial files, releases reservations, removes unknown abandoned upload directories, and retains recent terminal records for troubleshooting.

The status endpoint returns an actionable state (`active`, `paused`, `failed`, `completing`, `complete`, `cancelled`, or `expired`), an error explanation when applicable, progress, and missing chunk indexes. A session belongs to the account that created it; another uploader cannot read, modify, complete, or cancel it.

## Integrity and content validation

Completion streams chunks into one local original while calculating SHA-256. It verifies the exact declared length, compares an optional caller-supplied hash in constant time, validates the file signature or document-package structure independently of its browser MIME type, and then performs SHA-256 deduplication. Invalid, truncated, mislabeled, or unsafe files never enter the media-processing queue.

## Broad format support and converter diagnostics

The server publishes the current media catalog in the authenticated bootstrap response, and the browser uses that same catalog for its file picker. The catalog includes common camera/video containers, raw H.264/H.265 and transport streams, lossless and compressed audio, modern raster formats, legacy/macro-enabled Office, OpenDocument, Apple office packages, and safe text/table documents. The accepted extension is not a promise that every TV decodes the original natively: FFmpeg prepares a local H.264/AAC playback copy or image derivative when needed, while LibreOffice and Poppler turn documents into PNG lesson slides.

The Media upload dialog reports whether FFmpeg, FFprobe, LibreOffice, Poppler, the FFmpeg WebP encoder (`libwebp`), and the Ogg/Theora encoder (`libtheora`) are available. A missing optional converter does not bypass signature validation or hide the upload; the item remains in the library with the exact remediation error. Install the recommended Linux/Docker prerequisites or follow the manual package commands in [installation](installation.md) before exercising the corresponding fixture family.

## Atomic storage accounting

`StorageService` counts the data tree and subtracts the unreceived portion of every active reservation. A session creation and its reservation are committed together under one server lock, so simultaneous requests cannot both claim the same remaining capacity. Chunk writes update `ReceivedBytes` and the chunk bitmap incrementally and never perform a recursive disk scan. Settings and uploaders see both remaining capacity and the bytes reserved by active sessions.

LessonCue keeps its existing 512 MiB operating-system reserve. Unexpected external disk consumption can still make a previously reserved write fail; the session reports that failure explicitly and remains retryable until expiration.

## Service Admin policy

Open **Settings → Media & storage → Upload limits** to configure:

- maximum bytes per file;
- a default per-account daily allowance;
- one to ten simultaneous active sessions per account;
- stricter daily overrides by account username/UUID or role;
- shared daily limits by class name/UUID;
- optional FFmpeg video/audio codec allowlists.

Zero size/daily values and empty codec lists mean unrestricted. When multiple account limits apply, the strictest wins. Daily allowance calculations reset at 00:00 UTC and include both completed uploads and active reservations, preventing parallel sessions from bypassing a cap. Class limits are shared by all uploaders targeting that class. Codec names are determined locally from file contents during media inspection; a disallowed codec produces a visible processing failure rather than trusting the extension or browser header.
