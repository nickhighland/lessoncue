# LessonCue TV — release shrinking.
#
# The app parses JSON by hand with org.json rather than by reflection, and has
# no JavaScript bridge, so there are no field or method names that have to
# survive for something else to look up. That is what makes shrinking safe here.

# Our own names are kept so a crash report from a television is readable and so
# the manifest's components resolve. The code is still shrunk and optimized;
# only the names stay.
-keepnames class org.lessoncue.tv.** { *; }

# Entry points named in the manifest.
-keep class org.lessoncue.tv.MainActivity { *; }
-keep class org.lessoncue.tv.UpdateInstallReceiver { *; }

# Media3 selects renderers and extractors reflectively by class name.
-keep class androidx.media3.exoplayer.** { *; }
-dontwarn androidx.media3.**

# Kept quiet rather than kept: these are optional dependencies of libraries we
# use, referenced but never reached.
-dontwarn org.slf4j.**
-dontwarn javax.annotation.**
