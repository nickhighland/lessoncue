# Third-party software

LessonCue includes and depends on third-party open-source software. Those components remain under their own licenses; the PolyForm Noncommercial license for LessonCue does not replace or restrict those licenses.

Every tagged release contains:

- `LessonCue-SBOM.spdx.json`, an SPDX inventory generated from the completed release files; and
- `THIRD-PARTY-NOTICES.txt`, a deterministic package, version, license, and upstream-source inventory generated from that SBOM.

The release SBOM is also attached to the exact artifact checksums through a GitHub/Sigstore SBOM attestation. Use the release-specific files rather than this source-tree note when auditing a deployed version, because dependencies can change between releases.

Major directly bundled or linked projects include ASP.NET Core/.NET, Entity Framework Core, SQLite/SQLitePCLRaw, React, Vite, FFmpeg, yt-dlp, LibreOffice, Poppler, and Android/Jetpack Media3 components. Consult the generated release inventory and each upstream distribution for complete license texts and transitive dependency notices.
