import CryptoKit
import Foundation

actor OfflineCache {
    static let shared = OfflineCache()

    private let directory: URL = {
        let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let directory = root.appendingPathComponent("LessonCueMedia", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }()

    func localURL(for item: CueItem) -> URL? {
        let file = directory.appendingPathComponent(item.itemId)
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        if let expected = item.sha256,
           let data = try? Data(contentsOf: file, options: .mappedIfSafe),
           SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() != expected { return nil }
        return file
    }

    func cache(_ item: CueItem, from remoteURL: URL, token: String) async throws {
        guard item.offlineEligible else { return }
        var request = URLRequest(url: remoteURL)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (temporary, response) = try await URLSession.shared.download(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else { throw CacheError.downloadFailed }
        let destination = directory.appendingPathComponent(item.itemId)
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: temporary, to: destination)
    }

    enum CacheError: Error { case downloadFailed }
}
