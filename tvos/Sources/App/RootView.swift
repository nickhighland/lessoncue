import AVKit
import Combine
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

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
            case .lesson(let playlist):
                LessonMediaView(playlist: playlist)
            case .playback(let playlist, let items, let index, let seekMs):
                PlaybackView(playlist: playlist, items: items, index: index, seekMs: seekMs)
            }
            if model.diagnosticCaptureVisible {
                VStack { HStack { Spacer(); Text("DIAGNOSTIC SCREENSHOT · ADMIN REQUEST")
                    .font(.caption.bold()).padding(14).background(Color.red.opacity(0.92)).clipShape(RoundedRectangle(cornerRadius: 8)) }
                    Spacer() }.padding(36)
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
    @State private var signageEntryIndex = 0
    private var signage: SignageCue? {
        model.manifest?.signage.first(where: { $0.mode == "emergency" }) ?? model.manifest?.signage.first
    }
    private var signageEntries: [SignagePlaylistEntry] { signage?.contentPlaylist?.items ?? [] }
    private var signageEntry: SignagePlaylistEntry? {
        signageEntries.isEmpty ? nil : signageEntries[signageEntryIndex % signageEntries.count]
    }

    var body: some View {
      ZStack {
        Color(hex: signageEntry?.layout?.backgroundColor ?? signage?.backgroundColor ?? "#08111f").ignoresSafeArea()
        if let audio = signageEntry?.layout?.backgroundAudio ?? signage?.backgroundAudio {
            SignageAudio(item: audio, volumePercent: signage?.volumePercent ?? 100)
        }
        if let signage, let layout = signageEntry?.layout { SignageZoneLayout(signage: signage, zonesOverride: layout.zones) }
        else if let signage, !(signage.zones ?? []).isEmpty { SignageZoneLayout(signage: signage) }
        else if let media = signageEntry?.media { SignageBackdrop(item: media) }
        else if let media = signage?.media { SignageBackdrop(item: media) }
        if signageEntry?.layout != nil || !(signage?.zones ?? []).isEmpty { Color.black.opacity(0.30).ignoresSafeArea() }
        HStack(alignment: .top, spacing: 80) {
            VStack(alignment: .leading, spacing: 18) {
                Text("LESSONCUE").font(.headline).tracking(5).foregroundStyle(Color.lessonGold)
                Text(model.manifest?.screen.name ?? "Apple TV").font(.system(size: 48, weight: .bold))
                Text("Offline manifest \(model.manifest?.manifestVersion ?? 0)").foregroundStyle(.secondary)
                if let signage {
                    Text(signage.mode == "emergency" ? "EMERGENCY" : signage.name.uppercased())
                        .font(.headline).tracking(3).foregroundStyle(signage.mode == "emergency" ? Color.lessonCoral : Color.lessonGold).padding(.top, 16)
                    Text(signage.message).font(.title2.bold())
                }
                Spacer()
                Text("TODAY’S LESSON").font(.headline).foregroundStyle(.secondary)
                Text("Choose a lesson and press Start.").font(.title3)
            }
            .frame(width: 420, alignment: .leading)

            if signage?.mode == "emergency" {
                ContentUnavailableView("Emergency override active", systemImage: "exclamationmark.triangle.fill",
                    description: Text("Lesson playback resumes automatically when the override ends."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 22) {
                        ForEach(model.manifest?.playlists ?? []) { playlist in
                            Button { model.browse(playlist) } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 10) {
                                        Text(playlist.title).font(.title2.bold())
                                        Label("Offline schedule ready", systemImage: "checkmark.circle.fill")
                                            .font(.callout).foregroundStyle(Color.lessonMint)
                                    }
                                    Spacer()
                                    Text("VIEW MEDIA  ›").font(.headline).foregroundStyle(Color.lessonGold)
                                }.padding(28)
                            }
                            .buttonStyle(.card)
                        }
                    }
                }
            }
        }
        .padding(70)
        if signage?.displayPower == "off" { Color.black.ignoresSafeArea().zIndex(10_000) }
      }
      .task(id: signage?.contentPlaylist?.version) {
          if signage?.contentPlaylist?.synchronization == "screen" || signageEntries.isEmpty {
              signageEntryIndex = 0
          } else {
              let cycle = max(1, signageEntries.reduce(0) { $0 + max(1, $1.durationSeconds) })
              var offset = Int(Date().timeIntervalSince1970) % cycle
              signageEntryIndex = signageEntries.firstIndex { entry in
                  offset -= max(1, entry.durationSeconds)
                  return offset < 0
              } ?? 0
          }
          while !Task.isCancelled, !signageEntries.isEmpty {
              let seconds = max(1, signageEntries[signageEntryIndex % signageEntries.count].durationSeconds)
              try? await Task.sleep(for: .seconds(seconds))
              signageEntryIndex = (signageEntryIndex + 1) % signageEntries.count
          }
      }
    }
}

private struct SignageAudio: View {
    @EnvironmentObject private var model: AppModel
    let item: CueItem
    let volumePercent: Int
    @State private var player: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?
    var body: some View {
        Color.clear.task(id: item.id) {
            guard let url = await model.mediaURL(for: item) else { return }
            let audio = AVQueuePlayer()
            audio.volume = Float(max(0, min(100, volumePercent))) / 100
            looper = AVPlayerLooper(player: audio, templateItem: AVPlayerItem(url: url))
            player = audio
            audio.play()
        }.onDisappear { player?.pause(); player = nil; looper = nil }
    }
}

private struct SignageZoneLayout: View {
    @EnvironmentObject private var model: AppModel
    let signage: SignageCue
    var zonesOverride: [SignageZone]? = nil

    var body: some View {
        GeometryReader { proxy in
            ForEach((zonesOverride ?? signage.zones ?? []).filter { $0.hidden != true }.sorted { ($0.zIndex ?? 0) < ($1.zIndex ?? 0) }) { zone in
                ZStack {
                    Color(hex: zone.backgroundColor)
                    if let media = zone.media { SignageBackdrop(item: media, fit: zone.fit ?? "cover") }
                    if zone.type == "stream", let path = zone.streamUrl, let url = model.signageURL(for: path) {
                        SignageLiveStream(url: url, fit: zone.fit ?? "cover")
                    }
                    if zone.type == "presentation" {
                        SignagePresentationView(zone: zone, signage: signage)
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        if let title = zone.title, !["qr", "wifi", "presentation", "stream"].contains(zone.type) {
                            Text(title.uppercased()).font(.headline).tracking(3).foregroundStyle(Color(hex: zone.accentColor))
                        }
                        if zone.type == "clock" {
                            SignageClockView(zone: zone)
                        } else if zone.type == "qr" || zone.type == "wifi" {
                            if let value = zone.qrValue { SignageQRCode(value: value, zone: zone) }
                        } else if zone.type == "counter" {
                            SignageCounterView(zone: zone)
                        } else if !["presentation", "stream", "webpage", "customHtml"].contains(zone.type) {
                            let displayText = (zone.cached?.text.isEmpty == false ? zone.cached?.text : nil) ?? zone.content
                            if let text = displayText {
                                Group {
                                    if zone.type == "text", let runs = zone.richTextJson {
                                        SignageRichText(value: runs, fallback: text)
                                    } else if zone.type == "ticker" {
                                        SignageTickerView(text: text, speed: zone.tickerSpeed ?? 60)
                                    } else {
                                        Text(text)
                                    }
                                }
                                    .font(signageFont(zone))
                                    .fontWeight(signageFontWeight(zone.fontWeight))
                                    .italic(zone.italic == true)
                                    .underline(zone.underline == true)
                                    .multilineTextAlignment(signageTextAlignment(zone.textAlign))
                                    .lineSpacing(signageLineSpacing(zone))
                            }
                            ForEach(Array((zone.cached?.items ?? []).prefix(8).enumerated()), id: \.offset) { _, item in
                                Text("•  \(item)").font(.title3).lineLimit(1)
                            }
                        }
                    }
                    .foregroundStyle(Color(hex: zone.textColor)).padding(28).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                }
                .clipped()
                .frame(width: proxy.size.width * CGFloat(zone.width) / 100,
                       height: proxy.size.height * CGFloat(zone.height) / 100)
                .opacity(Double(zone.opacity ?? 100) / 100)
                .rotationEffect(.degrees(Double(zone.rotation ?? 0)))
                .scaleEffect(x: zone.flipX == true ? -1 : 1, y: zone.flipY == true ? -1 : 1)
                .position(x: proxy.size.width * (CGFloat(zone.x) + CGFloat(zone.width) / 2) / 100,
                          y: proxy.size.height * (CGFloat(zone.y) + CGFloat(zone.height) / 2) / 100)
                .zIndex(Double(zone.zIndex ?? 0))
            }
        }.ignoresSafeArea()
    }
}

private func signageFont(_ zone: SignageZone) -> Font {
    let size = CGFloat(min(300, max(8, zone.fontSize ?? 32)))
    switch zone.fontFamily?.lowercased() {
    case "georgia", "serif": return .custom("Georgia", size: size)
    case "arial", "sans-serif": return .custom("Arial", size: size)
    case "monospace": return .system(size: size, design: .monospaced)
    default: return .system(size: size, design: .rounded)
    }
}

private func signageFontWeight(_ value: Int?) -> Font.Weight {
    switch value ?? 600 {
    case ..<250: return .ultraLight
    case ..<350: return .light
    case ..<450: return .regular
    case ..<550: return .medium
    case ..<650: return .semibold
    case ..<750: return .bold
    case ..<850: return .heavy
    default: return .black
    }
}

private func signageTextAlignment(_ value: String?) -> TextAlignment {
    switch value {
    case "center": return .center
    case "right": return .trailing
    default: return .leading
    }
}

private func signageLineSpacing(_ zone: SignageZone) -> CGFloat {
    let size = CGFloat(min(300, max(8, zone.fontSize ?? 32)))
    return max(0, size * CGFloat((zone.lineHeightPercent ?? 120) - 100) / 100)
}

private struct SignageRichTextRun: Decodable {
    let text: String?
    let bold: Bool?
    let italic: Bool?
    let underline: Bool?
    let color: String?
}

private struct SignageRichText: View {
    let value: String
    let fallback: String

    private var rendered: Text {
        guard let data = value.data(using: .utf8),
              let runs = try? JSONDecoder().decode([SignageRichTextRun].self, from: data),
              !runs.isEmpty else { return Text(fallback) }
        return runs.prefix(50).reduce(Text("")) { result, run in
            var part = Text(run.text ?? "")
            if run.bold == true { part = part.bold() }
            if run.italic == true { part = part.italic() }
            if run.underline == true { part = part.underline() }
            if let color = run.color { part = part.foregroundColor(Color(hex: color)) }
            return result + part
        }
    }

    var body: some View { rendered }
}

private struct SignageCounterView: View {
    let zone: SignageZone

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            Text(counterText(at: context.date)).font(signageFont(zone)).fontWeight(signageFontWeight(zone.fontWeight))
        }
    }

    private func counterText(at now: Date) -> String {
        guard var target = zone.counterTargetAt else { return zone.content ?? "Countdown" }
        if zone.counterRepeatWeekly == true, target <= now {
            target = target.addingTimeInterval((floor(now.timeIntervalSince(target) / 604_800) + 1) * 604_800)
        }
        let total = max(0, Int(target.timeIntervalSince(now)))
        let days = total / 86_400
        let hours = (total % 86_400) / 3_600
        let minutes = (total % 3_600) / 60
        let seconds = total % 60
        let clock = String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        let countdown = days > 0 ? "\(days) days  \(clock)" : clock
        return zone.content?.replacingOccurrences(of: "[countdown]", with: countdown) ?? countdown
    }
}

private struct SignageClockView: View {
    let zone: SignageZone

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let time = Text(formatTime(context.date))
                .font(.system(size: CGFloat(zone.clockTimeFontSize ?? 64), weight: .bold, design: .rounded))
            let date = Text(formatDate(context.date))
                .font(.system(size: CGFloat(zone.clockDateFontSize ?? 28), weight: .regular, design: .rounded))
            switch zone.clockDisplay ?? "both" {
            case "time": time
            case "date": date
            default:
                if zone.clockOrder == "inline" {
                    HStack(alignment: .firstTextBaseline, spacing: 16) { time; date }
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        if zone.clockOrder == "date-time" { date; time } else { time; date }
                    }
                }
            }
        }
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = switch zone.clockTimeFormat {
        case "24h": "HH:mm"
        case "24h-seconds": "HH:mm:ss"
        case "12h-seconds": "h:mm:ss a"
        default: "h:mm a"
        }
        return formatter.string(from: date)
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = switch zone.clockDateFormat {
        case "numeric": "MM/dd/yyyy"
        case "short": "MMM d"
        case "medium": "EEE, MMM d"
        default: "EEEE, MMMM d, yyyy"
        }
        return formatter.string(from: date)
    }
}

private struct SignagePresentationView: View {
    @EnvironmentObject private var model: AppModel
    let zone: SignageZone
    let signage: SignageCue
    @State private var index = 0
    @State private var streamLive = false

    private var entries: [SignagePlaylistEntry] { zone.contentPlaylist?.items ?? [] }
    private var entry: SignagePlaylistEntry? { entries.isEmpty ? nil : entries[index % entries.count] }

    var body: some View {
        ZStack {
            if let layout = entry?.layout {
                Color(hex: layout.backgroundColor)
                SignageZoneLayout(signage: signage, zonesOverride: layout.zones)
            } else if let media = entry?.media {
                SignageBackdrop(item: media, fit: zone.fit ?? "contain", opacity: 1)
            } else if let title = entry?.title {
                Text(title).font(.title2.bold()).multilineTextAlignment(.center).padding(24)
            } else {
                Text("Select a published playlist").font(.title3).foregroundStyle(.secondary)
            }
            if zone.streamOverrideWhenLive == true, let path = zone.streamUrl,
               let url = model.signageURL(for: path) {
                SignageLiveStream(url: url, fit: zone.fit ?? "cover") { streamLive = $0 }
                    .opacity(streamLive ? 1 : 0)
            }
        }
        .clipped()
        .task(id: zone.contentPlaylist?.version) {
            index = 0
            while !Task.isCancelled, !entries.isEmpty {
                guard !streamLive else {
                    try? await Task.sleep(for: .seconds(1))
                    continue
                }
                try? await Task.sleep(for: .seconds(max(1, entries[index % entries.count].durationSeconds)))
                index = (index + 1) % entries.count
            }
        }
    }
}

private struct SignageTickerView: View {
    let text: String
    let speed: Int

    var body: some View {
        GeometryReader { proxy in
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { context in
                let distance = max(1, proxy.size.width + CGFloat(text.count * 24))
                let travelled = CGFloat(context.date.timeIntervalSinceReferenceDate) * CGFloat(min(300, max(10, speed)))
                Text(text).fixedSize().offset(x: proxy.size.width - travelled.truncatingRemainder(dividingBy: distance))
            }
        }.clipped()
    }
}

private struct SignageQRCode: View {
    let value: String
    let zone: SignageZone

    private var image: UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(value.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)),
              let cgImage = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    var body: some View {
        if let image {
            VStack(spacing: 8) {
                if let label = zone.qrLabelTop { Text(label).lineLimit(2) }
                HStack(spacing: 8) {
                    if zone.qrPlacement != "left", let label = zone.qrLabelLeft { Text(label).lineLimit(3).multilineTextAlignment(.trailing) }
                    Image(uiImage: image).interpolation(.none).resizable().scaledToFit()
                        .background(.white).accessibilityLabel("QR code")
                    if zone.qrPlacement != "right", let label = zone.qrLabelRight { Text(label).lineLimit(3).multilineTextAlignment(.leading) }
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
                if let label = zone.qrLabelBottom { Text(label).lineLimit(2) }
            }.frame(maxWidth: .infinity, maxHeight: .infinity).clipped()
        }
    }
}

private struct SignageBackdrop: View {
    @EnvironmentObject private var model: AppModel
    let item: CueItem
    var fit = "cover"
    var opacity = 0.38
    @State private var imageURL: URL?
    @State private var videoPlayer: AVQueuePlayer?
    @State private var videoLooper: AVPlayerLooper?

    var body: some View {
        Group {
            if item.type == "image", let imageURL {
                AsyncImage(url: imageURL) { phase in
                    if let image = phase.image {
                        if fit == "contain" { image.resizable().scaledToFit() }
                        else { image.resizable().scaledToFill() }
                    }
                    else { Color.clear }
                }
            } else if let videoPlayer {
                VideoPlayer(player: videoPlayer)
            }
        }
        .ignoresSafeArea()
        .opacity(opacity)
        .allowsHitTesting(false)
        .task(id: item.id) {
            guard let url = await model.mediaURL(for: item) else { return }
            if item.type == "image" {
                imageURL = url
            } else if item.type == "video" {
                let player = AVQueuePlayer()
                player.isMuted = true
                videoLooper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
                videoPlayer = player
                player.play()
            }
        }
        .onDisappear {
            videoPlayer?.pause()
            videoPlayer = nil
            videoLooper = nil
        }
    }
}

private struct SignageLiveStream: View {
    let url: URL
    var fit = "cover"
    var onAvailabilityChange: ((Bool) -> Void)? = nil
    @State private var player: AVPlayer?

    var body: some View {
        Group {
            if let player { VideoPlayer(player: player).aspectRatio(contentMode: fit == "contain" ? .fit : .fill) }
            else { Color.black }
        }
        .allowsHitTesting(false)
        .task(id: url) {
            let next = AVPlayer(url: url)
            next.isMuted = true
            player = next
            next.play()
            var waitingSeconds = 0
            while !Task.isCancelled {
                if next.timeControlStatus == .playing {
                    waitingSeconds = 0
                    onAvailabilityChange?(true)
                } else {
                    waitingSeconds += 1
                    if next.currentItem?.status == .failed || waitingSeconds >= 5 {
                        onAvailabilityChange?(false)
                    }
                }
                try? await Task.sleep(for: .seconds(1))
            }
        }
        .onDisappear { onAvailabilityChange?(false); player?.pause(); player = nil }
    }
}

private struct LessonMediaView: View {
    @EnvironmentObject private var model: AppModel
    let playlist: LessonPlaylist
    @FocusState private var focusedItem: String?

    private var items: [CueItem] {
        (playlist.preRoll?.items ?? []) + [playlist.countdown?.item].compactMap { $0 } + playlist.items
    }

    var body: some View {
        HStack(alignment: .top, spacing: 80) {
            VStack(alignment: .leading, spacing: 18) {
                Text("LESSON MEDIA").font(.headline).tracking(5).foregroundStyle(Color.lessonGold)
                Text(playlist.title).font(.system(size: 44, weight: .bold))
                Text("Use Up and Down to scroll every cue. Press Select to start at that item.")
                    .font(.title3).foregroundStyle(.secondary)
                Button("‹ Back to lessons") { model.route = .library }.padding(.top, 14)
                Spacer()
            }.frame(width: 420, alignment: .leading)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 18) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            Button { model.play(playlist, itemAt: index) } label: {
                                HStack(spacing: 22) {
                                    Text("\(index + 1)").font(.title2.bold()).foregroundStyle(Color.lessonGold)
                                        .frame(width: 48, alignment: .leading)
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text(item.title).font(.title2.bold())
                                        Text("\(role(for: item)) · \(item.type.uppercased())")
                                            .font(.callout).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text("PLAY  ›").font(.headline).foregroundStyle(Color.lessonGold)
                                }.padding(25)
                            }
                            .buttonStyle(.card).id(item.id).focused($focusedItem, equals: item.id)
                        }
                        if items.isEmpty { ContentUnavailableView("No lesson media", systemImage: "play.slash") }
                    }
                }
                .onChange(of: focusedItem) { _, value in
                    if let value { withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(value, anchor: .center) } }
                }
            }
        }
        .padding(70)
        .onAppear { focusedItem = items.first?.id }
        .onExitCommand { model.route = .library }
    }

    private func role(for item: CueItem) -> String {
        if item.id == playlist.countdown?.item.id { return "COUNTDOWN" }
        if playlist.preRoll?.items.contains(item) == true { return "PRE-ROLL" }
        return "LESSON"
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
    @State private var visualOpacity = 1.0
    @State private var repeatCompleted = 0

    private var item: CueItem? { items.indices.contains(index) ? items[index] : nil }

    var body: some View {
        ZStack(alignment: .top) {
            Color(hex: item?.fitMode == "letterbox" ? "#000000" : item?.backgroundColor ?? "#000000").ignoresSafeArea()
            if item?.type == "image", let imageURL {
                GeometryReader { proxy in
                    AsyncImage(url: imageURL) { phase in
                        if let image = phase.image {
                            image.resizable().aspectRatio(contentMode: item?.fitMode == "fill" ? .fill : .fit)
                                .cueTransform(item, size: proxy.size)
                        }
                        else if phase.error != nil { ContentUnavailableView("Image unavailable", systemImage: "photo") }
                        else { ProgressView() }
                    }
                }.ignoresSafeArea().clipped().opacity(visualOpacity)
            }
            else if let player {
                GeometryReader { proxy in
                    VideoPlayer(player: player).cueTransform(item, size: proxy.size)
                }.ignoresSafeArea().clipped().opacity(visualOpacity)
            }
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
        .onPlayPauseCommand {
            if player?.rate == 0 { player?.playImmediately(atRate: configuredRate) } else { player?.pause() }
        }
        .onChange(of: model.playbackCommand?.version) { _, _ in
            if model.playbackCommand?.action == "pause" { player?.pause() }
            if model.playbackCommand?.action == "resume" { player?.playImmediately(atRate: configuredRate) }
        }
        .onMoveCommand { direction in
            if direction == .right { advance() }
            if direction == .left, index > 0 { model.route = .playback(playlist: playlist, items: items, index: index - 1, seekMs: 0) }
        }
    }

    private var configuredRate: Float {
        Float((item?.playbackRatePercent ?? 100).clamped(to: 25...400)) / 100
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
            let durationMs = Int64(seconds * 1000)
            var elapsedMs: Int64 = 0
            while true {
                while elapsedMs <= durationMs {
                    visualOpacity = cueOpacity(item, positionMs: elapsedMs, durationMs: durationMs)
                    if elapsedMs % 1000 == 0 {
                        model.updatePlayback(PlaybackTelemetry(state: "playing", lessonId: playlist.id,
                            itemId: item.id, positionMs: elapsedMs, durationMs: durationMs, volumePercent: item.volumePercent))
                    }
                    try? await Task.sleep(nanoseconds: 50_000_000)
                    elapsedMs += Int64(50 * Double((item.playbackRatePercent ?? 100).clamped(to: 25...400)) / 100)
                    guard !Task.isCancelled else { return }
                }
                repeatCompleted += 1
                if item.endBehavior == "loop" || repeatCompleted < (item.repeatCount ?? 1).clamped(to: 1...99) {
                    elapsedMs = 0
                    continue
                }
                break
            }
            guard !Task.isCancelled else { return }
            if item.endBehavior == "advance" || playlist.preRoll?.items.contains(item) == true { advance() }
            else if item.endBehavior == "playlistLoop" { model.playNext(playlist: playlist, items: items, index: items.count - 1, loops: true) }
            else if item.endBehavior != "pause" {
                model.updatePlayback(PlaybackTelemetry())
                model.route = .library
            }
            return
        }
        imageURL = nil
        let next = AVPlayer(url: url)
        let targetVolume = item.muted == true ? 0 : min(1.5, Float(item.volumePercent) / 100)
        next.volume = (item.fadeInMs ?? 0) > 0 ? 0 : targetVolume
        visualOpacity = (item.fadeInMs ?? 0) > 0 ? 0 : 1
        model.updatePlayback(PlaybackTelemetry(state: "loading", lessonId: playlist.id,
            itemId: item.id, positionMs: max(0, seekMs), durationMs: item.durationMs,
            volumePercent: item.volumePercent))
        await next.seek(to: CMTime(value: item.startMs + max(0, seekMs), timescale: 1000))
        player = next
        next.playImmediately(atRate: Float((item.playbackRatePercent ?? 100).clamped(to: 25...400)) / 100)
        while !Task.isCancelled {
            let position = Int64(next.currentTime().seconds * 1000)
            let fadeIn = (item.fadeInMs ?? 0) > 0 ? min(1, max(0, Float(position - item.startMs) / Float(item.fadeInMs!))) : 1
            let end = item.endMs ?? (next.currentItem?.duration.seconds.isFinite == true ? Int64(next.currentItem!.duration.seconds * 1000) : nil)
            let fadeOut = (item.fadeOutMs ?? 0) > 0 && end != nil ? min(1, max(0, Float(end! - position) / Float(item.fadeOutMs!))) : 1
            let fade = min(fadeIn, fadeOut)
            next.volume = targetVolume * fade
            visualOpacity = min(Double(fade), cueTransitionOpacity(item, positionMs: max(0, position - item.startMs),
                durationMs: max(0, (end ?? item.durationMs ?? 0) - item.startMs)))
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
        repeatCompleted += 1
        if item.endBehavior == "loop" || repeatCompleted < (item.repeatCount ?? 1).clamped(to: 1...99) {
            await player.seek(to: CMTime(value: item.startMs, timescale: 1000))
            player.playImmediately(atRate: Float((item.playbackRatePercent ?? 100).clamped(to: 25...400)) / 100)
        }
        else if item.endBehavior == "advance" || playlist.preRoll?.items.contains(item) == true { advance() }
        else if item.endBehavior == "playlistLoop" { model.playNext(playlist: playlist, items: items, index: items.count - 1, loops: true) }
        else if item.endBehavior == "pause" {
            player.pause()
            model.updatePlayback(PlaybackTelemetry(state: "completed", lessonId: playlist.id,
                itemId: item.id, positionMs: item.endMs ?? item.durationMs ?? 0,
                durationMs: item.endMs ?? item.durationMs, volumePercent: item.volumePercent))
        }
        else {
            player.pause()
            model.updatePlayback(PlaybackTelemetry())
            model.route = .library
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

private func cueOpacity(_ item: CueItem, positionMs: Int64, durationMs: Int64) -> Double {
    let fadeIn = (item.fadeInMs ?? 0) > 0 ? min(1, max(0, Double(positionMs) / Double(item.fadeInMs!))) : 1
    let fadeOut = (item.fadeOutMs ?? 0) > 0 ? min(1, max(0, Double(durationMs - positionMs) / Double(item.fadeOutMs!))) : 1
    return min(fadeIn, fadeOut, cueTransitionOpacity(item, positionMs: positionMs, durationMs: durationMs))
}

private func cueTransitionOpacity(_ item: CueItem, positionMs: Int64, durationMs: Int64) -> Double {
    guard item.transitionStyle == "fade-black", (item.transitionDurationMs ?? 0) > 0, durationMs > 0 else { return 1 }
    let transition = Double(item.transitionDurationMs!)
    return min(1, max(0, Double(positionMs) / transition), max(0, Double(durationMs - positionMs) / transition))
}

private extension View {
    func cueTransform(_ item: CueItem?, size: CGSize) -> some View {
        let left = item?.cropLeftPercent ?? 0
        let right = item?.cropRightPercent ?? 0
        let top = item?.cropTopPercent ?? 0
        let bottom = item?.cropBottomPercent ?? 0
        let scaleX = 100 / CGFloat(max(11, 100 - left - right))
        let scaleY = 100 / CGFloat(max(11, 100 - top - bottom))
        return scaleEffect(x: scaleX, y: scaleY)
            .offset(x: CGFloat(right - left) / 200 * size.width * scaleX,
                    y: CGFloat(bottom - top) / 200 * size.height * scaleY)
            .rotationEffect(.degrees(Double(item?.rotationDegrees ?? 0)))
    }
}

private extension Comparable {
    func clamped(to limits: ClosedRange<Self>) -> Self { min(max(self, limits.lowerBound), limits.upperBound) }
}

private extension Color {
    static let lessonNavy = Color(red: 8/255, green: 17/255, blue: 31/255)
    static let lessonCream = Color(red: 247/255, green: 242/255, blue: 232/255)
    static let lessonGold = Color(red: 1, green: 182/255, blue: 100/255)
    static let lessonCoral = Color(red: 1, green: 122/255, blue: 110/255)
    static let lessonMint = Color(red: 88/255, green: 214/255, blue: 169/255)

    init(hex: String) {
        let value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let number = UInt64(value, radix: 16) ?? 0x08111f
        self.init(red: Double((number >> 16) & 0xff) / 255,
                  green: Double((number >> 8) & 0xff) / 255,
                  blue: Double(number & 0xff) / 255)
    }
}
