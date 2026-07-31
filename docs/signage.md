# Signage

LessonCue signage is an optional, self-hosted preview feature. A Service Admin must enable it under **Settings → Preview features** before Signage appears in navigation. Disable it to hide the interface and keep ordinary lesson playback unchanged.

The current workflow has three parts:

1. **Layouts** define the persistent regions and elements that appear on a sign.
2. **Playlists** define media that loops continuously inside a playlist region.
3. **Signs & screens** combine one layout with its playlist choices and assign the resulting sign to one or more screens.

Each screen has at most one active sign. One sign can be reused by many screens. Signage does not use the older Calendar, draft/publish, operations, or emergency-broadcast workflow; those concepts are historical and are not part of the supported current interface.

## Layouts

Choose a full-screen layout or an information frame. Information frames preserve a 16:9 presentation region while providing one to five evenly divided bottom slots and one to three sidebar slots. The layout colors, slot counts, and frame size update the editor preview immediately.

Each slot can contain one supported element, including:

- looping playlist area;
- text;
- image or logo;
- website or Wi-Fi QR code;
- weather;
- time and date;
- approved calendar feed;
- webpage;
- audience poll.

Select an element in the preview or inspector to edit it. Element settings control its content, background, padding, content scale, alignment, and type-specific options. The layout preview is intended to match browser output, but signage remains a preview feature while the capability contract and automated browser/Android rendering-conformance work in the roadmap are completed.

A playlist area can optionally use a server-relayed stream override. Enter the stream source and optional local start and end boundaries. During the configured window, a reachable stream replaces the normal playlist; when it drops or the window ends, the looping playlist returns.

## Playlists

Signage playlists loop indefinitely. Add Media Library items, arrange their order, and set duration, transition, fade-in, fade-out, volume, mute, and picture fit for each entry. The last item returns to the first.

Layouts select playlists by identifier. Saving a playlist or layout invalidates assigned display manifests so connected screens can refresh without a separate publishing step.

## Signs and screens

A sign contains:

- a name;
- one selected layout;
- the layout's playlist assignments;
- one or more paired screens.

Assigning a sign to a screen replaces that screen's prior sign assignment. Browser screens can be marked **Signage only** and **Permanent pairing**, then opened directly from **Screens** for a computer-connected television or projector. Permanent browser pairings are not removed by the two-hour inactive temporary-screen cleanup.

## Data sources and privacy

Online information sources are fetched by the LessonCue server, not separately by every screen. Service Admins approve source origins and store optional source credentials locally. Public calendar and weather data are normalized and cached so the last successful result can remain visible during a temporary provider failure.

QR values are generated locally for display. Wi-Fi QR codes contain the network information entered by the administrator, so treat signage layout access as sensitive and do not expose a private network password in labels.

## Playback compatibility

The paired browser player is the reference signage renderer. Android TV, Google TV, and Fire TV support a growing subset through the native client. Until the capability-contract roadmap item is complete, verify every layout on its actual target screen and avoid assigning browser-only elements without a tested fallback.

Apple TV/tvOS is not a supported LessonCue target in the current product cycle.
