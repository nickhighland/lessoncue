import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    enum Route {
        case loading
        case connect
        case pin(api: LessonCueAPI, requestId: String, serverName: String)
        case library
        case playback(playlist: LessonPlaylist, items: [CueItem], index: Int, seekMs: Int64)
    }

    @Published var route: Route = .loading
    @Published var manifest: ScreenManifest?
    @Published var errorMessage: String?
    @Published var playbackCommand: ControlCommand?
    @Published var playbackTelemetry = PlaybackTelemetry()
    @Published var acknowledgedControlVersion = 0
    let discovery = BonjourDiscovery()
    private(set) var identity: DeviceIdentity?
    private var scheduleTask: Task<Void, Never>?
    private var statusTask: Task<Void, Never>?
    private var controlTask: Task<Void, Never>?

    func start() async {
        discovery.start()
        guard let stored = CredentialStore.load() else { route = .connect; return }
        do {
            identity = stored
            manifest = try await LessonCueAPI(address: stored.serverURL.absoluteString).manifest(identity: stored)
            if let manifest { try? ManifestStore.save(manifest) }
            route = .library
            beginScheduleMonitor()
            beginStatusMonitor()
            beginControlMonitor()
            await cacheAssignedMedia()
        } catch {
            if let cached = ManifestStore.load() {
                manifest = cached
                errorMessage = "Using the last downloaded schedule while the server is offline."
                route = .library
                beginScheduleMonitor()
                beginStatusMonitor()
                beginControlMonitor()
            } else {
                errorMessage = "The saved server could not be reached. You can reconnect without losing downloaded media."
                route = .connect
            }
        }
    }

    func connect(address: String) async {
        do {
            errorMessage = nil
            let api = try LessonCueAPI(address: address)
            let name = try await api.discover()
            let requestId = try await api.beginPairing(deviceName: "Apple TV")
            route = .pin(api: api, requestId: requestId, serverName: name)
        } catch { errorMessage = error.localizedDescription }
    }

    func confirm(api: LessonCueAPI, requestId: String, pin: String) async {
        do {
            let paired = try await api.confirmPairing(requestId: requestId, pin: pin)
            try CredentialStore.save(paired)
            identity = paired
            manifest = try await api.manifest(identity: paired)
            if let manifest { try? ManifestStore.save(manifest) }
            route = .library
            beginScheduleMonitor()
            beginStatusMonitor()
            beginControlMonitor()
            await cacheAssignedMedia()
        } catch { errorMessage = error.localizedDescription }
    }

    func start(_ playlist: LessonPlaylist) {
        switch ScheduleCoordinator.phase(for: playlist) {
        case .countdown(let seek):
            guard let item = playlist.countdown?.item else { return }
            route = .playback(playlist: playlist, items: [item], index: 0, seekMs: seek)
        case .preRoll:
            route = .playback(playlist: playlist, items: playlist.preRoll?.items ?? [], index: 0, seekMs: 0)
        case .lesson, .idle:
            route = .playback(playlist: playlist, items: playlist.items, index: 0, seekMs: 0)
        }
    }

    func playNext(playlist: LessonPlaylist, items: [CueItem], index: Int, loops: Bool) {
        let next = index + 1
        if next < items.count { route = .playback(playlist: playlist, items: items, index: next, seekMs: 0) }
        else if loops && !items.isEmpty { route = .playback(playlist: playlist, items: items, index: 0, seekMs: 0) }
        else { playbackTelemetry = PlaybackTelemetry(); route = .library }
    }

    func leavePlayback() { playbackTelemetry = PlaybackTelemetry(); route = .library }

    func updatePlayback(_ telemetry: PlaybackTelemetry) { playbackTelemetry = telemetry }

    private func beginScheduleMonitor() {
        scheduleTask?.cancel()
        scheduleTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                switch self.route {
                case .library:
                    guard let playlists = self.manifest?.playlists else { break }
                    if let playlist = playlists.first(where: {
                        switch ScheduleCoordinator.phase(for: $0) { case .countdown(_), .preRoll: true; default: false }
                    }) { self.start(playlist) }
                case .playback(let playlist, let items, _, _):
                    let playingIds = items.map(\.id)
                    let preRollIds = playlist.preRoll?.items.map(\.id) ?? []
                    let isPreRoll = !preRollIds.isEmpty && playingIds == preRollIds
                    let isCountdown = playingIds.count == 1 && playingIds.first == playlist.countdown?.item.id
                    switch ScheduleCoordinator.phase(for: playlist) {
                    case .countdown(let seek) where isPreRoll:
                        if let item = playlist.countdown?.item {
                            self.route = .playback(playlist: playlist, items: [item], index: 0, seekMs: seek)
                        }
                    case .lesson where isPreRoll || isCountdown:
                        self.route = .playback(playlist: playlist, items: playlist.items, index: 0, seekMs: 0)
                    default:
                        break
                    }
                default:
                    break
                }
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
        }
    }

    private func beginStatusMonitor() {
        statusTask?.cancel()
        statusTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, let identity = self.identity, let manifest = self.manifest,
                      let api = try? LessonCueAPI(address: identity.serverURL.absoluteString) else { return }
                let attributes = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory())
                let freeBytes = (attributes?[.systemFreeSize] as? NSNumber)?.int64Value ?? 0
                let cachedItems = await OfflineCache.shared.cachedItemCount()
                try? await api.reportStatus(identity: identity, manifestVersion: manifest.manifestVersion,
                    freeBytes: freeBytes, acknowledgedControlVersion: self.acknowledgedControlVersion,
                    playback: self.playbackTelemetry, cachedItems: cachedItems,
                    totalItems: manifest.allItems.count)
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }

    private func beginControlMonitor() {
        controlTask?.cancel()
        controlTask = Task { [weak self] in
            guard let self, let identity = self.identity,
                  let api = try? LessonCueAPI(address: identity.serverURL.absoluteString) else { return }
            var version = (try? await api.control(identity: identity).version) ?? 0
            while !Task.isCancelled {
                if let command = try? await api.control(identity: identity, after: version) {
                    version = max(version, command.version)
                    if command.changed { await self.apply(command, api: api, identity: identity) }
                }
                try? await Task.sleep(nanoseconds: 750_000_000)
            }
        }
    }

    private func apply(_ command: ControlCommand, api: LessonCueAPI, identity: DeviceIdentity) async {
        playbackCommand = command
        switch command.action {
        case "play":
            if let latest = try? await api.manifest(identity: identity) { manifest = latest }
            guard let playlist = manifest?.playlists.first(where: { $0.id == command.lessonId }) else { return }
            let allItems = (playlist.preRoll?.items ?? []) + [playlist.countdown?.item].compactMap { $0 } + playlist.items
            if let itemId = command.itemId, let index = allItems.firstIndex(where: { $0.id == itemId }) {
                route = .playback(playlist: playlist, items: allItems, index: index, seekMs: 0)
            } else { route = .playback(playlist: playlist, items: playlist.items, index: 0, seekMs: 0) }
        case "stop": route = .library
        case "next":
            if case .playback(let playlist, let items, let index, _) = route, index + 1 < items.count {
                route = .playback(playlist: playlist, items: items, index: index + 1, seekMs: 0)
            }
        case "previous":
            if case .playback(let playlist, let items, let index, _) = route {
                route = .playback(playlist: playlist, items: items, index: max(0, index - 1), seekMs: 0)
            }
        case "seek":
            if case .playback(let playlist, let items, let index, _) = route {
                route = .playback(playlist: playlist, items: items, index: index, seekMs: max(0, command.positionMs ?? 0))
            }
        case "pause", "resume": break
        default: break
        }
        acknowledgedControlVersion = command.version
        await reportStatusNow(api: api, identity: identity)
    }

    private func reportStatusNow(api: LessonCueAPI, identity: DeviceIdentity) async {
        guard let manifest else { return }
        let attributes = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory())
        let freeBytes = (attributes?[.systemFreeSize] as? NSNumber)?.int64Value ?? 0
        let cachedItems = await OfflineCache.shared.cachedItemCount()
        try? await api.reportStatus(identity: identity, manifestVersion: manifest.manifestVersion,
            freeBytes: freeBytes, acknowledgedControlVersion: acknowledgedControlVersion,
            playback: playbackTelemetry, cachedItems: cachedItems, totalItems: manifest.allItems.count)
    }

    func mediaURL(for item: CueItem) async -> URL? {
        if let local = await OfflineCache.shared.localURL(for: item) { return local }
        guard let identity, let path = item.downloadUrl,
              let api = try? LessonCueAPI(address: identity.serverURL.absoluteString) else { return nil }
        return api.absoluteMediaURL(path)
    }

    private func cacheAssignedMedia() async {
        guard let identity, let manifest,
              let api = try? LessonCueAPI(address: identity.serverURL.absoluteString) else { return }
        let allItems = manifest.playlists.flatMap { playlist in
            playlist.items + (playlist.preRoll?.items ?? []) + [playlist.countdown?.item].compactMap { $0 }
        }
        for item in allItems where item.offlineEligible {
            if await OfflineCache.shared.localURL(for: item) != nil { continue }
            guard let path = item.downloadUrl, let url = api.absoluteMediaURL(path) else { continue }
            try? await OfflineCache.shared.cache(item, from: url,
                token: url.host == identity.serverURL.host ? identity.deviceToken : nil)
        }
    }
}

private extension ScreenManifest {
    var allItems: [CueItem] {
        playlists.flatMap { playlist in
            playlist.items + (playlist.preRoll?.items ?? []) + [playlist.countdown?.item].compactMap { $0 }
        }.reduce(into: [CueItem]()) { items, item in
            if !items.contains(where: { $0.id == item.id }) { items.append(item) }
        }
    }
}
