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
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .
ENV LESSONCUE_DATA_PATH=/data \
    LESSONCUE_HTTP_PORT=8080
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["dotnet", "LessonCue.Server.dll"]
