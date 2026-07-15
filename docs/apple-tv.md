# Apple TV delivery

Generate the Xcode project from `tvos/project.yml` so build settings remain reviewable. Set the organization bundle identifier and Apple Developer team in a local or CI configuration, add the required App Store icons and top-shelf assets, and archive with a current Xcode release.

The app declares `_lessoncue._tcp` Bonjour discovery and local-network usage. Users must grant local-network access. Device credentials are kept in Keychain; downloaded files are stored in the application cache and may be reclaimed by tvOS, so the client must continuously re-evaluate readiness.

tvOS may suspend the app and does not guarantee exact unattended wake. Validate scheduled countdown startup on each Apple TV model and tvOS version before advertising unattended operation.
