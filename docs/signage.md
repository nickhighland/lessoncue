# Signage scheduling

LessonCue signage uses the same local media library, paired screens, screen tags, and authenticated manifests as lesson playback. It does not require the hosted demonstration interface or a cloud scheduling service.

## Create or edit signage

Open **Signage** in the local administrator interface and choose **New signage**. Each sign has:

- a mode: emergency override, scheduled signage, or idle fallback;
- a priority from 0 through 100;
- text, colors, and optional Media Library content;
- a single, sidebar, split, header-grid, or dashboard layout with up to eight zones;
- a one-time window, daily recurrence, or selected weekdays;
- optional first and last dates plus excluded `YYYY-MM-DD` dates;
- explicit paired-screen targets, screen-tag targets, or an all-screen default.

Recurring times use the organization time zone shown at the top of the Signage page. A window such as 10:00 PM–2:00 AM crosses midnight and belongs to the day on which it starts. The ending boundary is exclusive, preventing two adjacent schedules from overlapping for a minute.

Use **Edit**, **Pause**, **Resume**, or **Delete** on a sign card. Pausing retains the complete schedule but removes it from display manifests.

## Layouts and information widgets

The visual 16:9 layout builder starts with a preset and lets an administrator assign each zone as media, text, a live clock/date, calendar, weather, menu or schedule, RSS headlines, or generic JSON data. Each zone has its own heading, fallback text, background, text and accent colors. Advanced position fields are available when a preset needs fine adjustment, but no CSS or template code is required.

Online widget sources must first be approved under **Settings → Organization & appearance → Approved signage information sources**. Enter the origin only, such as `https://weather.example.org`; paths beneath that origin can then be selected by signage editors. LessonCue rejects unapproved origins and URLs with embedded credentials.

The server fetches source data instead of asking every television to contact the internet. RSS/Atom titles, ICS calendar summaries, weather JSON, line-based menu text, and common JSON `items` or `events` structures are normalized and stored in the local database. Each zone may refresh every 5 minutes through daily. **Refresh data** on the sign card performs an immediate refresh.

If a request fails, LessonCue records the error but retains the last successful cached content. That cache is embedded in the paired-screen manifest and its offline copy, so native and browser displays continue showing the last known information. Fallback text is used before the first successful refresh or when a source has no displayable content.

## Conflict order

LessonCue resolves active signage in this order:

1. emergency override;
2. scheduled signage;
3. idle fallback.

Within a level, the higher numeric priority wins. Equal priorities prefer the most recently edited sign. The server publishes signs in this deterministic order so Android TV, Apple TV, and browser displays agree on the winner.

Explicit screen IDs and screen tags are inclusive: a sign matches when the display is directly selected or has any listed tag. If both are blank, the sign targets every paired display.

## Readiness

The Signage page reports all attached server and zone media as **ready**, **preparing**, **failed**, or **missing**. It also reports how many targeted displays have cached every media zone in the sign and whether any display reported a cache failure. The authenticated manifest includes future targeted signs in `signageSchedule`; Android TV and Apple TV put that media through the same checksummed cache and heartbeat diagnostics as lesson media. Paired browser displays store scheduled signage audio, images, and video in durable origin Cache Storage, use the service worker copy during a network interruption, prune obsolete sign media, and report ready, downloading, and failed inventory in their heartbeat. Browser storage remains subject to the browser and operating system's quota and eviction policy.

## Lesson handoff

Normal signage occupies the display's idle/library state. Existing scheduled pre-roll, countdown, and lesson playback takes control at its configured times; finishing or stopping playback reveals the current active sign. An emergency sign interrupts active lesson playback on Android TV, Apple TV, and browser displays, blocks new lesson selection while the override is active, and resumes the interrupted cue at its last reported position when the override ends. See the manual physical-device acceptance item in the roadmap for final D-pad, Siri Remote, sleep/wake, and real-network checks.
