import Foundation

struct DeviceIdentity: Codable, Sendable {
    let screenId: String
    let deviceToken: String
    let serverURL: URL
}

private struct DiscoveryResponse: Decodable { let serverName: String }
private struct PairingRequestResponse: Decodable { let requestId: String }
private struct PairingResponse: Decodable { let screenId: String; let deviceToken: String }
struct ControlCommand: Decodable, Equatable, Sendable {
    let changed: Bool
    let version: Int
    let action: String
    let lessonId: String?
    let itemId: String?
    let positionMs: Int64?
    let screenshotRequestId: String?
    let screenshotExpiresAt: Date?
}

struct PlaybackTelemetry: Equatable, Sendable {
    var state = "idle"
    var lessonId: String?
    var itemId: String?
    var positionMs: Int64 = 0
    var durationMs: Int64?
    var volumePercent = 100
    var error: String?
}

struct LessonCueAPI: Sendable {
    let serverURL: URL

    init(address: String) throws {
        let normalized = address.contains("://") ? address : "http://\(address)"
        guard let url = URL(string: normalized)?.standardized else { throw APIError.invalidAddress }
        serverURL = url
    }

    func discover() async throws -> String {
        let response: DiscoveryResponse = try await request(path: "/.well-known/lessoncue")
        return response.serverName
    }

    func beginPairing(deviceName: String) async throws -> String {
        let body = try JSONSerialization.data(withJSONObject: [
            "deviceName": deviceName, "platform": "tvos", "appVersion": "0.24.1"
        ])
        let response: PairingRequestResponse = try await request(path: "/api/v1/pairing/request", method: "POST", body: body)
        return response.requestId
    }

    func confirmPairing(requestId: String, pin: String) async throws -> DeviceIdentity {
        let body = try JSONSerialization.data(withJSONObject: ["requestId": requestId, "pin": pin])
        let response: PairingResponse = try await request(path: "/api/v1/pairing/confirm", method: "POST", body: body)
        return DeviceIdentity(screenId: response.screenId, deviceToken: response.deviceToken, serverURL: serverURL)
    }

    func manifest(identity: DeviceIdentity) async throws -> ScreenManifest {
        try await request(path: "/api/v1/screens/\(identity.screenId)/manifest", token: identity.deviceToken)
    }

    func control(identity: DeviceIdentity, after: Int? = nil) async throws -> ControlCommand {
        let suffix = after.map { "?after=\($0)" } ?? ""
        return try await request(path: "/api/v1/screens/\(identity.screenId)/control\(suffix)", token: identity.deviceToken)
    }

    func reportStatus(identity: DeviceIdentity, manifestVersion: Int, freeBytes: Int64,
                      failedDownloads: Int = 0, acknowledgedControlVersion: Int = 0,
                      playback: PlaybackTelemetry = PlaybackTelemetry(), cachedItems: Int = 0,
                      totalItems: Int = 0, cacheInventory: [CacheDiagnostic] = [],
                      downloadQueue: [DownloadDiagnostic] = [], recentDeviceErrors: [DeviceDiagnosticError] = []) async throws {
        var recentErrors = recentDeviceErrors.map(\.jsonObject)
        if let playbackError = playback.error { recentErrors.insert(["timestamp": ISO8601DateFormatter().string(from: Date()),
            "area": "playback", "message": playbackError, "itemId": jsonValue(playback.itemId)], at: 0) }
        let body = try JSONSerialization.data(withJSONObject: [
            "screenId": identity.screenId,
            "appVersion": "0.24.1",
            "online": true,
            "freeBytes": freeBytes,
            "manifestVersion": manifestVersion,
            "failedDownloads": failedDownloads,
            "acknowledgedControlVersion": acknowledgedControlVersion,
            "playbackState": playback.state,
            "lessonId": jsonValue(playback.lessonId),
            "itemId": jsonValue(playback.itemId),
            "positionMs": playback.positionMs,
            "durationMs": jsonValue(playback.durationMs),
            "volumePercent": playback.volumePercent,
            "playbackError": jsonValue(playback.error),
            "cachedItems": cachedItems,
            "totalItems": totalItems,
            "deviceModel": "Apple TV",
            "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
            "clientTimeUnixMs": Int64(Date().timeIntervalSince1970 * 1_000),
            "networkLatencyMs": NetworkMetrics.shared.current,
            "cacheInventory": cacheInventory.map(\.jsonObject),
            "downloadQueue": downloadQueue.map(\.jsonObject),
            "codecCapabilities": [
                ["kind": "video", "codec": "H.264 / AVC", "supported": true, "detail": "AVFoundation"],
                ["kind": "video", "codec": "H.265 / HEVC", "supported": true, "detail": "AVFoundation"],
                ["kind": "audio", "codec": "AAC", "supported": true, "detail": "AVFoundation"],
                ["kind": "audio", "codec": "MP3", "supported": true, "detail": "AVFoundation"]
            ],
            "recentErrors": recentErrors
        ])
        guard let url = URL(string: "/api/v1/tv/status", relativeTo: serverURL)?.absoluteURL else { throw APIError.invalidAddress }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(identity.deviceToken)", forHTTPHeaderField: "Authorization")
        let started = ContinuousClock.now
        let (_, response) = try await URLSession.shared.data(for: request)
        NetworkMetrics.shared.record(started.duration(to: .now))
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw APIError.server("The server did not accept this Apple TV's status update.")
        }
    }

    func uploadDiagnosticScreenshot(identity: DeviceIdentity, requestId: String, jpeg: Data) async throws {
        guard let url = URL(string: "/api/v1/tv/screens/\(identity.screenId)/diagnostics/screenshot/\(requestId)", relativeTo: serverURL)?.absoluteURL else { throw APIError.invalidAddress }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.httpBody = jpeg
        request.timeoutInterval = 20
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.setValue(String(jpeg.count), forHTTPHeaderField: "Content-Length")
        request.setValue("Bearer \(identity.deviceToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw APIError.server(String(data: data, encoding: .utf8) ?? "The diagnostic screenshot was not accepted.")
        }
    }

    func absoluteMediaURL(_ path: String) -> URL? {
        if let direct = URL(string: path), direct.scheme != nil { return direct }
        return URL(string: path, relativeTo: serverURL)?.absoluteURL
    }

    private func request<T: Decodable>(path: String, method: String = "GET", body: Data? = nil, token: String? = nil) async throws -> T {
        guard let url = URL(string: path, relativeTo: serverURL)?.absoluteURL else { throw APIError.invalidAddress }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let started = ContinuousClock.now
        let (data, response) = try await URLSession.shared.data(for: request)
        NetworkMetrics.shared.record(started.duration(to: .now))
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw APIError.server(String(data: data, encoding: .utf8) ?? "Server request failed")
        }
        return try LessonCueJSON.decoder.decode(T.self, from: data)
    }
}

struct CacheDiagnostic: Sendable {
    let itemId: String, title: String, state: String
    let sizeBytes: Int64, expectedBytes: Int64?, error: String?
    var jsonObject: [String: Any] { ["itemId": itemId, "title": title, "state": state,
        "sizeBytes": sizeBytes, "expectedBytes": jsonValue(expectedBytes), "error": jsonValue(error)] }
}

struct DownloadDiagnostic: Sendable {
    let itemId: String, title: String, state: String
    let bytesDownloaded: Int64, expectedBytes: Int64?, error: String?
    var jsonObject: [String: Any] { ["itemId": itemId, "title": title, "state": state,
        "bytesDownloaded": bytesDownloaded, "expectedBytes": jsonValue(expectedBytes), "error": jsonValue(error)] }
}

struct DeviceDiagnosticError: Sendable {
    let timestamp: Date, area: String, message: String, itemId: String?
    var jsonObject: [String: Any] { ["timestamp": ISO8601DateFormatter().string(from: timestamp), "area": area,
        "message": message, "itemId": jsonValue(itemId)] }
}

private final class NetworkMetrics: @unchecked Sendable {
    static let shared = NetworkMetrics()
    private let lock = NSLock()
    private var latency = 0
    var current: Int { lock.withLock { latency } }
    func record(_ duration: Duration) {
        let milliseconds = duration.components.seconds * 1_000 + duration.components.attoseconds / 1_000_000_000_000_000
        lock.withLock { latency = max(0, min(120_000, Int(milliseconds))) }
    }
}

private func jsonValue<T>(_ value: T?) -> Any {
    value.map { $0 as Any } ?? NSNull()
}

enum APIError: LocalizedError {
    case invalidAddress
    case server(String)
    var errorDescription: String? {
        switch self {
        case .invalidAddress: "Enter a valid LessonCue server address."
        case .server(let message): message
        }
    }
}
