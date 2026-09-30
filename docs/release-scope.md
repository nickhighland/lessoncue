# Release scope

LessonCue releases are classified automatically by the release workflow.

Changes under `android-tv/`, `vega-tv/`, or `protocol/` require TV artifacts.
Those releases build the Android TV packages and may publish the Google Play
and Amazon store artifacts. Changes limited to the server, web administration
console, installers, documentation, or release tooling are server-only; they
publish the server packages without rebuilding or pushing the TV app.

The workflow's `release_scope` input defaults to `auto`. `server-only` is an
assertion guarded by the same path check and fails closed if a TV-app or
protocol path changed. `tv` is available when a maintainer deliberately needs
to publish a TV artifact despite a path-only change, such as a signing or
packaging correction. A server-only release never includes stale Android TV
artifacts copied from a reused validation run.

The Apple TV/tvOS prototype remains abandoned and is not part of this rule or
the release pipeline.
