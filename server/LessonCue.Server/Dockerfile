FROM node:22-bookworm-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY web-admin/ web-admin/
RUN npm run build:admin

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY server/LessonCue.Server/LessonCue.Server.csproj server/LessonCue.Server/
RUN dotnet restore server/LessonCue.Server/LessonCue.Server.csproj
COPY server/LessonCue.Server/ server/LessonCue.Server/
COPY --from=web /src/server/LessonCue.Server/wwwroot/ server/LessonCue.Server/wwwroot/
RUN dotnet publish server/LessonCue.Server/LessonCue.Server.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
ARG TARGETARCH
ARG YT_DLP_VERSION=2026.07.04
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libreoffice-impress libreoffice-writer libreoffice-calc libreoffice-draw poppler-utils ca-certificates curl bubblewrap util-linux coreutils \
        fonts-liberation \
    && optional_packages="" \
    && for candidate in libavcodec-extra libavcodec-extra59 libavcodec-extra60 libavcodec-extra61; do if apt-cache show "$candidate" >/dev/null 2>&1; then optional_packages="$optional_packages $candidate"; break; fi; done \
    && for candidate in libwebp7 libwebp6; do if apt-cache show "$candidate" >/dev/null 2>&1; then optional_packages="$optional_packages $candidate"; break; fi; done \
    && for candidate in libtheora0; do if apt-cache show "$candidate" >/dev/null 2>&1; then optional_packages="$optional_packages $candidate"; break; fi; done \
    && for candidate in libvpx9 libvpx8 libvpx7; do if apt-cache show "$candidate" >/dev/null 2>&1; then optional_packages="$optional_packages $candidate"; break; fi; done \
    && for candidate in libopus0; do if apt-cache show "$candidate" >/dev/null 2>&1; then optional_packages="$optional_packages $candidate"; break; fi; done \
    && for candidate in libvorbis0a; do if apt-cache show "$candidate" >/dev/null 2>&1; then optional_packages="$optional_packages $candidate"; break; fi; done \
    && for candidate in libheif1 libheif2; do if apt-cache show "$candidate" >/dev/null 2>&1; then optional_packages="$optional_packages $candidate"; break; fi; done \
    && for candidate in libavif16 libavif15; do if apt-cache show "$candidate" >/dev/null 2>&1; then optional_packages="$optional_packages $candidate"; break; fi; done \
    && for candidate in libjxl0 libjxl0.7; do if apt-cache show "$candidate" >/dev/null 2>&1; then optional_packages="$optional_packages $candidate"; break; fi; done \
    && for candidate in libopenjp2-8 libopenjp2-7; do if apt-cache show "$candidate" >/dev/null 2>&1; then optional_packages="$optional_packages $candidate"; break; fi; done \
    && if [ -n "$optional_packages" ]; then apt-get install -y --no-install-recommends $optional_packages; fi \
    && if [ "$TARGETARCH" = "amd64" ] && apt-cache show intel-media-va-driver >/dev/null 2>&1; then apt-get install -y --no-install-recommends intel-media-va-driver; fi \
    && if [ "$TARGETARCH" = "amd64" ] && apt-cache show i965-va-driver >/dev/null 2>&1; then apt-get install -y --no-install-recommends i965-va-driver; fi \
    && rm -rf /var/lib/apt/lists/*
RUN case "$TARGETARCH" in \
      arm64) asset=yt-dlp_linux_aarch64; expected=b6ce97646773070d7a7ffd6bbbdcaecb47c48483909c54c915bf08a7a9b5e0b1 ;; \
      *) asset=yt-dlp_linux; expected=6bbb3d314cde4febe36e5fa1d55462e29c974f63444e707871834f6d8cc210ae ;; \
    esac \
    && curl -fL "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${asset}" -o /usr/local/bin/yt-dlp \
    && printf '%s  %s\n' "${expected}" /usr/local/bin/yt-dlp | sha256sum -c - \
    && chmod 0755 /usr/local/bin/yt-dlp \
    && test "$(/usr/local/bin/yt-dlp --version)" = "${YT_DLP_VERSION}"
RUN groupadd --gid 10001 lessoncue \
    && useradd --uid 10001 --gid 10001 --home-dir /data --shell /usr/sbin/nologin lessoncue \
    && install -d -o lessoncue -g lessoncue -m 0750 /data
WORKDIR /app
COPY --from=build /app/publish .
COPY installers/linux/lessoncue-media-worker /usr/local/libexec/lessoncue-media-worker
RUN chmod 0755 /usr/local/libexec/lessoncue-media-worker
ENV LESSONCUE_DATA_PATH=/data \
    LESSONCUE_HTTP_PORT=8080 \
    HOME=/data \
    XDG_CACHE_HOME=/data/.cache
EXPOSE 8080
VOLUME ["/data"]
USER 10001:10001
ENTRYPOINT ["dotnet", "LessonCue.Server.dll"]
