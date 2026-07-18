import Foundation

public struct CuePoint: Codable, Equatable, Sendable {
    public let name: String
    public let positionMs: Int64

    public init(name: String, positionMs: Int64) {
        self.name = name
        self.positionMs = positionMs
    }
}

public struct CueItem: Codable, Identifiable, Equatable, Sendable {
    public let itemId: String
    public let mediaId: String?
    public let type: String
    public let title: String
    public let downloadUrl: String?
    public let contentType: String?
    public let fileExtension: String?
    public let sha256: String?
    public let sizeBytes: Int64?
    public let durationMs: Int64?
    public let startMs: Int64
    public let endMs: Int64?
    public let volumePercent: Int
    public let imageDurationSeconds: Int?
    public let endBehavior: String
    public let allowSkip: Bool
    public let notes: String?
    public let fadeInMs: Int64?
    public let fadeOutMs: Int64?
    public let offlineEligible: Bool
    public let cuePoints: [CuePoint]?
    public var id: String { itemId }

    public init(itemId: String, mediaId: String? = nil, type: String = "video", title: String,
                downloadUrl: String? = nil, contentType: String? = nil, fileExtension: String? = nil,
                sha256: String? = nil, sizeBytes: Int64? = nil,
                durationMs: Int64? = nil, startMs: Int64 = 0, endMs: Int64? = nil,
                volumePercent: Int = 100, imageDurationSeconds: Int? = nil,
                endBehavior: String = "advance", allowSkip: Bool = true, notes: String? = nil,
                fadeInMs: Int64? = nil, fadeOutMs: Int64? = nil, offlineEligible: Bool = false,
                cuePoints: [CuePoint]? = nil) {
        self.itemId = itemId; self.mediaId = mediaId; self.type = type; self.title = title
        self.downloadUrl = downloadUrl; self.contentType = contentType; self.fileExtension = fileExtension
        self.sha256 = sha256; self.sizeBytes = sizeBytes
        self.durationMs = durationMs; self.startMs = startMs; self.endMs = endMs
        self.volumePercent = volumePercent; self.imageDurationSeconds = imageDurationSeconds
        self.endBehavior = endBehavior; self.allowSkip = allowSkip; self.notes = notes
        self.fadeInMs = fadeInMs; self.fadeOutMs = fadeOutMs; self.offlineEligible = offlineEligible
        self.cuePoints = cuePoints
    }
}

public struct CountdownCue: Codable, Equatable, Sendable {
    public let enabled: Bool
    public let itemId: String
    public let durationMs: Int64
    public let startAt: Date?
    public let item: CueItem
}

public struct PreRollCue: Codable, Equatable, Sendable {
    public let enabled: Bool
    public let loop: Bool
    public let items: [CueItem]
}

public struct LessonPlaylist: Codable, Identifiable, Equatable, Sendable {
    public let playlistId: String
    public let title: String
    public let version: Int
    public let designatedStartAt: Date?
    public let preRollStartsAt: Date?
    public let availableFrom: Date?
    public let expiresAt: Date?
    public let countdown: CountdownCue?
    public let preRoll: PreRollCue?
    public let items: [CueItem]
    public var id: String { playlistId }

    public init(playlistId: String, title: String, version: Int = 1, designatedStartAt: Date? = nil, preRollStartsAt: Date? = nil,
                availableFrom: Date? = nil, expiresAt: Date? = nil, countdown: CountdownCue? = nil,
                preRoll: PreRollCue? = nil, items: [CueItem] = []) {
        self.playlistId = playlistId; self.title = title; self.version = version
        self.designatedStartAt = designatedStartAt; self.preRollStartsAt = preRollStartsAt; self.availableFrom = availableFrom
        self.expiresAt = expiresAt; self.countdown = countdown; self.preRoll = preRoll; self.items = items
    }
}

public struct ScreenInfo: Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let volunteerMode: Bool
}

public struct SignageCue: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let mode: String
    public let priority: Int
    public let message: String
    public let backgroundColor: String
    public let textColor: String
    public let mediaUrl: String?
    public let media: CueItem?
}

public struct ScreenManifest: Codable, Equatable, Sendable {
    public let apiVersion: Int
    public let manifestVersion: Int
    public let generatedAt: Date
    public let screen: ScreenInfo
    public let signage: [SignageCue]
    public let signageSchedule: [SignageCue]?
    public let playlists: [LessonPlaylist]
}

public enum PlaybackPhase: Equatable, Sendable {
    case idle
    case preRoll
    case countdown(seekMilliseconds: Int64)
    case lesson
}

public enum ScheduleCoordinator {
    public static func phase(for playlist: LessonPlaylist, now: Date = Date()) -> PlaybackPhase {
        guard let designated = playlist.designatedStartAt else { return .lesson }
        guard now < designated else { return .lesson }
        if let countdown = playlist.countdown {
            let begins = countdown.startAt ?? designated.addingTimeInterval(-Double(countdown.durationMs) / 1000)
            if now >= begins {
                return .countdown(seekMilliseconds: max(0, Int64(now.timeIntervalSince(begins) * 1000)))
            }
        }
        let preRollStarted = now >= (playlist.preRollStartsAt ?? designated.addingTimeInterval(-30 * 60))
        return preRollStarted && playlist.preRoll?.items.isEmpty == false ? .preRoll : .idle
    }
}

public enum LessonCueJSON {
    public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
