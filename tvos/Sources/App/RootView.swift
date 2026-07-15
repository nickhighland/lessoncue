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
    @State private var address = "http://lessoncue.local:8080"

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
    @State private var unavailable = false

    private var item: CueItem? { items.indices.contains(index) ? items[index] : nil }

    var body: some View {
        ZStack(alignment: .top) {
            if let player { VideoPlayer(player: player).ignoresSafeArea() }
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
        }
        .task(id: item?.id) { await prepare() }
        .onDisappear { player?.pause() }
        .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { notification in
            guard let ended = notification.object as? AVPlayerItem, ended === player?.currentItem else { return }
            Task { await handleCompletion() }
        }
        .onPlayPauseCommand { player?.rate == 0 ? player?.play() : player?.pause() }
        .onMoveCommand { direction in
            if direction == .right { advance() }
            if direction == .left, index > 0 { model.route = .playback(playlist: playlist, items: items, index: index - 1, seekMs: 0) }
        }
    }

    private func prepare() async {
        guard let item, let url = await model.mediaURL(for: item) else { unavailable = true; return }
        unavailable = false
        let next = AVPlayer(url: url)
        next.volume = min(1, Float(item.volumePercent) / 100)
        await next.seek(to: CMTime(value: max(item.startMs, seekMs), timescale: 1000))
        player = next
        next.play()
    }

    private func handleCompletion() async {
        guard let item, let player else { return }
        if item.endBehavior == "loop" { await player.seek(to: .zero); player.play() }
        else if item.endBehavior == "advance" || playlist.preRoll?.items.contains(item) == true { advance() }
        else { player.pause() }
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
