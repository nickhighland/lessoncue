# Accessibility acceptance

LessonCue targets WCAG 2.2 Level AA for the local administration interface, browser display, controller, audience interaction, and setup flows. Accessibility is a release requirement, not an optional visual mode.

Automated checks catch only part of the requirement. A release candidate passes only after the automated suite and the manual matrix below have both been completed against the exact release build. Record the date, build, operating system, browser or device, tester, and any accepted exception with an issue link.

## Automated release check

From the repository root:

```bash
npm ci
npm run test:a11y
```

The Playwright suite runs axe-core against first-run or sign-in, Dashboard, Classes, Media Library, Settings, and the shared confirmation dialog. It also verifies dialog focus entry, Escape dismissal, and restoration of focus to the initiating control. The ordinary browser workflow separately exercises keyboard-operable timeline handles.

Do not suppress a rule solely to make the check green. Fix the markup or presentation. A narrowly scoped exception must explain why the rule is inapplicable and link to a tracked issue.

## Keyboard and switch-style input

Test without a mouse:

- Tab and Shift+Tab reach every interactive control in a logical order. Focus is always visible and is never trapped outside a modal.
- The skip link reaches the start of the current workspace. Navigation changes move focus to the new main region.
- Enter and Space activate buttons and selectable cards. Escape closes dialogs without applying destructive work and returns focus to the initiating control.
- Every destructive action opens a labelled confirmation dialog; the action name and consequence are understandable before confirmation.
- Timeline trim and fade handles work with Left and Right Arrow. The corresponding numeric/range controls expose the same saved values.
- Signage canvas elements can be selected with Enter or Space, moved with Arrow keys, resized with Alt+Arrow, rotated with `[` and `]`, reordered with Control/Command+Arrow, and adjusted exactly in the inspector. Shift selects a larger movement step.
- Reordering lists has visible Move up/Move down controls or an equivalent keyboard action. Saving never requires drag, hover, or a pointer gesture.
- At 400% zoom and a 320 CSS-pixel viewport, the reading and focus order remains meaningful and no action becomes unreachable in a two-dimensional scroll trap.

## Screen readers

Complete both desktop combinations and the applicable mobile/display combination:

| Platform | Minimum combination | Acceptance |
| --- | --- | --- |
| Windows | NVDA with current Chrome or Edge | Landmarks, headings, navigation state, form labels/hints/errors, tables, dialogs, and live status changes are announced accurately. |
| macOS/iOS | VoiceOver with current Safari | Rotor navigation is meaningful; focus follows view and dialog changes; touch exploration exposes named controls. |
| Android | TalkBack on a supported Android device | Controller and audience pages have named controls, sensible swipe order, and no touch-only unlabeled action. |
| TV/remote | Android TV, Google TV, or Fire TV with D-pad/remote | Initial focus is visible; D-pad reaches every transport and lesson choice; Back exits overlays; playback controls do not depend on touch. |

Errors must be associated with the affected task, announced when they appear, preserve the user's safe input, and provide a recovery action. Success, progress, reconnection, and completion messages must use polite live announcements; blocking failures use assertive alerts.

## Visual, motion, and touch checks

- Verify text and meaningful icons at normal, hover, selected, disabled, error, and focus states meet WCAG AA contrast. Do not rely on color alone for state.
- Test browser zoom at 200% and 400%, large system text, Windows High Contrast/forced colors, and both light and dark browser defaults.
- Enable `prefers-reduced-motion: reduce`; decorative animation and transitions must stop, while state changes remain understandable.
- Verify controls intended for touch have at least a 44 by 44 CSS-pixel target or sufficient spacing from adjacent targets.
- Test portrait and landscape phone layouts without horizontal scrolling for ordinary reading and form completion.
- Check uploaded images for useful alternative text where they convey interface meaning. Decorative imagery uses empty alternative text.

## Release evidence and issue severity

Any inaccessible authentication, setup, update/recovery, primary navigation, lesson control, media upload, or playback action blocks release. Other WCAG AA failures remain release-blocking unless the Service Admin can disable the unfinished feature and it is disabled by default. Store completed manual results with the release notes or linked release issue; do not mark the roadmap item complete from an automated scan alone.

