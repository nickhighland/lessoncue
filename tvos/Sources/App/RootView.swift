import AVKit
import Combine
import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            Color.lessonNavy.ignoresSafeArea()
            switch model.route {
            case .loading:
                ProgressView("Searching for LessonCue…")
            case .connect:
                ConnectView()
            case .pin(let api, let requestId, let serverName):
                PairingView(api: api, requestId: requestId, serverName: serverName)
            case .library:
                LibraryView()
            case .playback(let playlist, let items, let index, let seekMs):
                PlaybackView(playlist: playlist, items: items, index: index, seekMs: seekMs)
            }
        }
        .foregroundStyle(Color.lessonCream)
    }
}

private struct ConnectView: View {
    @EnvironmentObject private var model: AppModel
    @State private var address = "http://lessoncue.local"

    var body: some View {
        FormPanel(eyebrow: "LESSONCUE", title: "Connect this Apple TV",
                  subtitle: "Choose a discovered server or enter the address shown during installation.") {
            if !model.discovery.servers.isEmpty {
                ForEach(model.discovery.servers) { server in
                    Button("\(server.name)  ·  \(server.interface ?? "Local network")") {
                        Task { await model.connect(address: server.address) }
                    }
                }
            }
            TextField("Server address", text: $address)
                .textContentType(.URL)
            Button("Find server") { Task { await model.connect(address: address) } }
                .buttonStyle(.borderedProminent)
            ErrorText(message: model.errorMessage)
        }
    }
}

private struct PairingView: View {
    @EnvironmentObject private var model: AppModel
    let api: LessonCueAPI
    let requestId: String
    let serverName: String
    @State private var pin = ""

    var body: some View {
        FormPanel(eyebrow: "PAIR THIS SCREEN", title: serverName,
                  subtitle: "Enter the six-digit PIN shown in LessonCue Settings → Pair a screen.") {
            TextField("000000", text: $pin)
                .onChange(of: pin) { _, value in pin = String(value.filter(\.isNumber).prefix(6)) }
            Button("Pair Apple TV") { Task { await model.confirm(api: api, requestId: requestId, pin: pin) } }
                .buttonStyle(.borderedProminent)
                .disabled(pin.count != 6)
            ErrorText(message: model.errorMessage)
        }
    }
}

private struct LibraryView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        HStack(alignment: .top, spacing: 80) {
            VStack(alignment: .leading, spacing: 18) {
                Text("LESSONCUE").font(.headline).tracking(5).foregroundStyle(Color.lessonGold)
                Text(model.manifest?.screen.name ?? "Apple TV").font(.system(size: 48, weight: .bold))
                Text("Offline manifest \(model.manifest?.manifestVersion ?? 0)").foregroundStyle(.secondary)
                if let signage = model.manifest?.signage.first(where: { $0.mode == "emergency" }) ?? model.manifest?.signage.first {
                    Text(signage.mode == "emergency" ? "EMERGENCY" : signage.name.uppercased())
                        .font(.headline).tracking(3).foregroundStyle(signage.mode == "emergency" ? Color.lessonCoral : Color.lessonGold).padding(.top, 16)
                    Text(signage.message).font(.title2.bold())
                }
                Spacer()
                Text("TODAY’S LESSON").font(.headline).foregroundStyle(.secondary)
                Text("Choose a lesson and press Start.").font(.title3)
            }
            .frame(width: 420, alignment: .leading)

            ScrollView {
                LazyVStack(spacing: 22) {
                    ForEach(model.manifest?.playlists ?? []) { playlist in
                        Button { model.start(playlist) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text(playlist.title).font(.title2.bold())
                                    Label("Offline schedule ready", systemImage: "checkmark.circle.fill")
                                        .font(.callout).foregroundStyle(Color.lessonMint)
                                }
                                Spacer()
                                Text("START  ›").font(.headline).foregroundStyle(Color.lessonGold)
                            }.padding(28)
                        }
                        .buttonStyle(.card)
                    }
                }
            }
        }
        .padding(70)
    }
}

private struct PlaybackView: View {
    @EnvironmentObject private var model: AppModel
    let playlist: LessonPlaylist
    let items: [CueItem]
    let index: Int
    let seekMs: Int64
    @State private var player: AVPlayer?
    @State private var imageURL: URL?
    @State private var unavailable = false

    private var item: CueItem? { items.indices.contains(index) ? items[index] : nil }

    var body: some View {
        ZStack(alignment: .top) {
            if item?.type == "image", let imageURL {
                AsyncImage(url: imageURL) { phase in
                    if let image = phase.image { image.resizable().scaledToFit() }
                    else if phase.error != nil { ContentUnavailableView("Image unavailable", systemImage: "photo") }
                    else { ProgressView() }
                }.ignoresSafeArea()
            }
            else if let player { VideoPlayer(player: player).ignoresSafeArea() }
            else if unavailable { ContentUnavailableView("Media unavailable", systemImage: "wifi.slash", description: Text("Reconnect to the server or download this lesson before going offline.")) }
            HStack {
                VStack(alignment: .leading) {
                    Text(item?.title ?? playlist.title).font(.title2.bold())
                    Text("\(index + 1) of \(max(1, items.count))").foregroundStyle(.secondary)
                }
                Spacer()
                Button("Exit") { model.leavePlayback() }
            }
            .padding(28).background(.black.opacity(0.7))
            if let notes = item?.notes, !notes.isEmpty {
                Text(notes).font(.title3).padding(18).background(.black.opacity(0.8))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading).padding(28)
            }
        }
        .task(id: item?.id) { await prepare() }
        .onDisappear { player?.pause() }
        .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { notification in
            guard let ended = notification.object as? AVPlayerItem, ended === player?.currentItem else { return }
            Task { await handleCompletion() }
        }
        .onPlayPauseCommand { player?.rate == 0 ? player?.play() : player?.pause() }
        .onChange(of: model.playbackCommand?.version) { _, _ in
            if model.playbackCommand?.action == "pause" { player?.pause() }
            if model.playbackCommand?.action == "resume" { player?.play() }
        }
        .onMoveCommand { direction in
            if direction == .right { advance() }
            if direction == .left, index > 0 { model.route = .playback(playlist: playlist, items: items, index: index - 1, seekMs: 0) }
        }
    }

    private func prepare() async {
        guard let item, let url = await model.mediaURL(for: item) else {
            unavailable = true
            model.updatePlayback(PlaybackTelemetry(state: "error", lessonId: playlist.id,
                itemId: item?.id, error: "Media is unavailable on this screen."))
            return
        }
        unavailable = false
        if item.type == "image" {
            player?.pause(); player = nil; imageURL = url
            let seconds = max(1, item.imageDurationSeconds ?? 10)
            for elapsed in 0..<seconds {
                model.updatePlayback(PlaybackTelemetry(state: "playing", lessonId: playlist.id,
                    itemId: item.id, positionMs: Int64(elapsed * 1000),
                    durationMs: Int64(seconds * 1000), volumePercent: item.volumePercent))
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled else { return }
            }
            guard !Task.isCancelled else { return }
            if item.endBehavior == "advance" || playlist.preRoll?.items.contains(item) == true { advance() }
            return
        }
        imageURL = nil
        let next = AVPlayer(url: url)
        let targetVolume = min(1.5, Float(item.volumePercent) / 100)
        next.volume = (item.fadeInMs ?? 0) > 0 ? 0 : targetVolume
        model.updatePlayback(PlaybackTelemetry(state: "loading", lessonId: playlist.id,
            itemId: item.id, positionMs: max(0, seekMs), durationMs: item.durationMs,
            volumePercent: item.volumePercent))
        await next.seek(to: CMTime(value: item.startMs + max(0, seekMs), timescale: 1000))
        player = next
        next.play()
        while !Task.isCancelled {
            let position = Int64(next.currentTime().seconds * 1000)
            let fadeIn = (item.fadeInMs ?? 0) > 0 ? min(1, max(0, Float(position - item.startMs) / Float(item.fadeInMs!))) : 1
            let end = item.endMs ?? (next.currentItem?.duration.seconds.isFinite == true ? Int64(next.currentItem!.duration.seconds * 1000) : nil)
            let fadeOut = (item.fadeOutMs ?? 0) > 0 && end != nil ? min(1, max(0, Float(end! - position) / Float(item.fadeOutMs!))) : 1
            next.volume = targetVolume * min(fadeIn, fadeOut)
            let duration = next.currentItem?.duration.seconds
            let state = next.timeControlStatus == .playing ? "playing" :
                (next.timeControlStatus == .waitingToPlayAtSpecifiedRate ? "buffering" : "paused")
            model.updatePlayback(PlaybackTelemetry(state: state, lessonId: playlist.id,
                itemId: item.id, positionMs: max(0, position),
                durationMs: duration?.isFinite == true ? Int64(duration! * 1000) : item.durationMs,
                volumePercent: item.volumePercent,
                error: next.currentItem?.error?.localizedDescription))
            if let end = item.endMs, position >= end { await handleCompletion(); return }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    private func handleCompletion() async {
        guard let item, let player else { return }
        if item.endBehavior == "loop" { await player.seek(to: .zero); player.play() }
        else if item.endBehavior == "advance" || playlist.preRoll?.items.contains(item) == true { advance() }
        else {
            player.pause()
            model.updatePlayback(PlaybackTelemetry(state: "completed", lessonId: playlist.id,
                itemId: item.id, positionMs: item.endMs ?? item.durationMs ?? 0,
                durationMs: item.endMs ?? item.durationMs, volumePercent: item.volumePercent))
        }
    }

    private func advance() {
        model.playNext(playlist: playlist, items: items, index: index, loops: playlist.preRoll?.items == items)
    }
}

private struct FormPanel<Content: View>: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    @ViewBuilder let content: Content

    init(eyebrow: String, title: String, subtitle: String, @ViewBuilder content: () -> Content) {
        self.eyebrow = eyebrow; self.title = title; self.subtitle = subtitle; self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text(eyebrow).font(.headline).tracking(5).foregroundStyle(Color.lessonGold)
            Text(title).font(.system(size: 52, weight: .bold))
            Text(subtitle).font(.title3).foregroundStyle(.secondary)
            content
        }.frame(maxWidth: 850, alignment: .leading).padding(80)
    }
}

private struct ErrorText: View {
    let message: String?
    var body: some View { if let message { Text(message).foregroundStyle(Color.lessonCoral) } }
}

private extension Color {
    static let lessonNavy = Color(red: 8/255, green: 17/255, blue: 31/255)
    static let lessonCream = Color(red: 247/255, green: 242/255, blue: 232/255)
    static let lessonGold = Color(red: 1, green: 182/255, blue: 100/255)
    static let lessonCoral = Color(red: 1, green: 122/255, blue: 110/255)
    static let lessonMint = Color(red: 88/255, green: 214/255, blue: 169/255)
}
