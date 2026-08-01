# LessonCue change log

This is the short, user-facing history of LessonCue releases. Each release also
publishes its matching notes on GitHub so the update screen can explain what is
changing before an administrator installs it.

## v0.40.5 — clearer updates and a more dependable release

What you will notice:

- The update screen now explains the purpose of an available update before you install it.
- Media uploads and browser validation now follow the current two-step media workflow.
- Administration screens have clearer contrast and better labels for keyboard and assistive-technology users.

Behind the scenes:

- Release validation no longer depends on the Bubblewrap gate that cannot run reliably on GitHub-hosted runners.
- GitHub releases now publish this user-facing change log and reuse it in Android TV update messages.
