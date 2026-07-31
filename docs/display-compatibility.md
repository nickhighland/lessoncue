# Display compatibility contract

LessonCue supports two display client families in the current product cycle:

- the browser display at `/display` or `/player`;
- Android TV, Google TV, and Fire TV through the Android application.

Apple TV/tvOS is explicitly not a supported target in this release.

The server is the source of truth. `GET /api/v1/display-capabilities` publishes both current contracts; add `?platform=web-player` or `?platform=android-tv` for one. Every paired-screen manifest also contains `capabilityContractVersion`, `displayCapabilities`, `compatibilityWarnings`, and a per-cue or per-zone `renderSupport` decision.

## Current matrix

| Content or behavior | Browser | Android TV / Google TV / Fire TV | Fallback |
| --- | --- | --- | --- |
| Local images, audio, and compatible video | Supported | Supported with ExoPlayer/Coil | Explanatory title card |
| YouTube and approved embedded media | Supported through an iframe | Supported through an Android WebView | Explanatory title card |
| Approved webpages | Supported through a sandboxed iframe | Supported through an Android WebView | Explanatory title card |
| Trim, repeat, speed, fit, crop, rotation, and fade-through-black | Supported | Supported | Explanatory title card |
| D-pad previous/next, hold-to-seek, and media play/pause | Keyboard/media-key equivalent | Supported | Previous/Next remain available on fallback cards |
| Signage media, streams, presentations, text, clocks, QR/Wi-Fi, countdowns, webpages, and custom HTML | Supported | Supported | Element-level title card |
| Server-cached weather, calendar, and RSS data | Full visual renderer | Native simplified cached-data renderer | Element-level title card |
| Live audience-result signage | Supported | **Browser-only** in this release | Element-level title card; use a browser display for live graphics |

Third-party webpages and video providers can still deny embedding or require internet access. That is an upstream availability limitation, not an undeclared LessonCue renderer.

## Assignment safety

Before assigning a class to a screen, the Screens page asks the server to assess every active lesson cue against that screen’s declared platform. Before a Sign is assigned, the signage workflow assesses every element in its persistent layout against every selected screen. Unsupported items are listed before the assignment is saved.

An operator can deliberately continue. The override is audited, and affected manifests carry a safe fallback instruction. The clients never silently render a blank rectangle: they display the item title, an actionable reason, and working navigation.

Unknown or future clients receive the `unknown` contract and are treated as unsupported until they identify as a reviewed client family.

## Conformance gates

- Server unit tests cover platform normalization, declared capabilities, assignment assessment, and manifest render decisions.
- Browser Playwright tests exercise the actual fallback renderer and compare it with a committed 1280×720 golden screenshot.
- Android JVM tests parse the contract, warnings, and renderer decisions.
- Android remote-key tests cover D-pad tap navigation, hold-to-seek, play, pause, and center-button behavior; the fallback view uses the same key-state implementation.
- JSON fixtures in `tests/fixtures/display-capabilities/` pin the public version-1 expectations for both client families.

Change the contract version whenever a field is removed or its meaning changes. Additive capabilities may retain the version only when older clients can safely ignore them.
