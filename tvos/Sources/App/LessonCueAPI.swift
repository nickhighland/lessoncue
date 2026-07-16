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
            "deviceName": deviceName, "platform": "tvos", "appVersion": "0.7.0"
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

    func reportStatus(identity: DeviceIdentity, manifestVersion: Int, freeBytes: Int64, failedDownloads: Int = 0) async throws {
        let body = try JSONSerialization.data(withJSONObject: [
            "screenId": identity.screenId,
            "appVersion": "0.7.0",
            "online": true,
            "freeBytes": freeBytes,
            "manifestVersion": manifestVersion,
            "failedDownloads": failedDownloads
        ])
        guard let url = URL(string: "/api/v1/tv/status", relativeTo: serverURL)?.absoluteURL else { throw APIError.invalidAddress }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(identity.deviceToken)", forHTTPHeaderField: "Authorization")
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw APIError.server("The server did not accept this Apple TV's status update.")
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
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw APIError.server(String(data: data, encoding: .utf8) ?? "Server request failed")
        }
        return try LessonCueJSON.decoder.decode(T.self, from: data)
    }
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
