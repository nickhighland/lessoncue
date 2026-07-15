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
    let discovery = BonjourDiscovery()
    private(set) var identity: DeviceIdentity?

    func start() async {
        discovery.start()
        guard let stored = CredentialStore.load() else { route = .connect; return }
        do {
            identity = stored
            manifest = try await LessonCueAPI(address: stored.serverURL.absoluteString).manifest(identity: stored)
            route = .library
            await cacheAssignedMedia()
        } catch {
            errorMessage = "The saved server could not be reached. You can reconnect without losing downloaded media."
            route = .connect
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
            route = .library
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
        else { route = .library }
    }

    func leavePlayback() { route = .library }

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
            try? await OfflineCache.shared.cache(item, from: url, token: identity.deviceToken)
        }
    }
}
