# Amazon Appstore approval checklist

Use this checklist for every Fire TV submission. Amazon's current Fire TV
criteria test the installed binary with a remote, not just whether the server
is reachable.

## Clean-install review path

- Install the exact store APK on a physical Fire TV device.
- Enter `http://lsnq.demo`, select **Find server**, enter `123456`, and select
  **Open demo**.
- Confirm the normal lesson library has an obvious highlighted sample lesson.
- Confirm Up/Down moves focus through every actionable control and Select opens
  the lesson-detail screen and its cue timeline.
- Confirm the cue timeline exposes pre-roll, countdown, lesson, and post-roll
  entries and that D-pad navigation reaches each one.
- Confirm Back returns from player → lesson detail → lesson library without
  requiring Home.
- Confirm the bundled video plays and loops without network access.
- Confirm Play/Pause, Rewind, Fast-forward, media Previous/Next, Back, and
  Home do not crash, trap, or unexpectedly exit the app.
- Repeat the flow with rapid button presses and after returning from Home.

## Submission hygiene

- Upload a newly built store APK with a version code greater than the last
  submitted APK.
- Put the exact review steps from
  [Amazon Appstore testing instructions](amazon-appstore-testing-instructions.md)
  in the Console's **Testing Instructions** field for every submission.
- Test the release APK on physical hardware; an emulator or unit test is not a
  substitute for Fire TV remote testing.
- Verify the listing description, screenshots, privacy labels, content rating,
  and any third-party media or intellectual-property permissions match the
  uploaded binary.
- Keep the APK comfortably below Amazon's 4 GB installed-size limit and verify
  the UI at a 1080p, 10-foot viewing distance.

## Official Amazon references

- [Test Criteria for Amazon Appstore Apps](https://developer.amazon.com/docs/app-testing/test-criteria.html)
- [Fire TV design and user-experience guidelines](https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html)
- [Amazon Appstore Presubmission Checklist](https://developer.amazon.com/docs/app-submission/presubmission-checklist.html)
- [Listing and Promotion Policy — granting Amazon access for review](https://developer.amazon.com/docs/policy-center/listing-promo.html)
