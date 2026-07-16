import CryptoKit
import Foundation

actor OfflineCache {
    static let shared = OfflineCache()
    private var recentErrors: [String: (Date, String)] = [:]

    private let directory: URL = {
        let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let directory = root.appendingPathComponent("LessonCueMedia", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }()

    func localURL(for item: CueItem) -> URL? {
        let current = destination(for: item)
        let legacy = directory.appendingPathComponent(item.itemId)
        let file = FileManager.default.fileExists(atPath: current.path) ? current : legacy
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        if let expected = item.sha256,
           let data = try? Data(contentsOf: file, options: .mappedIfSafe),
           SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() != expected { return nil }
        return file
    }

    func cache(_ item: CueItem, from remoteURL: URL, token: String?) async throws {
        guard item.offlineEligible else { return }
        do {
            var request = URLRequest(url: remoteURL)
            if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            let (temporary, response) = try await URLSession.shared.download(for: request)
            guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else { throw CacheError.downloadFailed }
            let destination = destination(for: item)
            try? FileManager.default.removeItem(at: destination)
            try FileManager.default.moveItem(at: temporary, to: destination)
            recentErrors.removeValue(forKey: item.itemId)
        } catch {
            recentErrors[item.itemId] = (Date(), error.localizedDescription)
            throw error
        }
    }

    func cachedItemCount() -> Int {
        (try? FileManager.default.contentsOfDirectory(at: directory,
            includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]).count) ?? 0
    }

    func diagnostics(for items: [CueItem]) -> ([CacheDiagnostic], [DownloadDiagnostic]) {
        var inventory: [CacheDiagnostic] = []
        var queue: [DownloadDiagnostic] = []
        for item in items where item.offlineEligible {
            let destination = destination(for: item)
            let legacy = directory.appendingPathComponent(item.itemId)
            let file = FileManager.default.fileExists(atPath: destination.path) ? destination : legacy
            let partial = destination.appendingPathExtension("part")
            let cached = FileManager.default.fileExists(atPath: file.path)
            let downloading = FileManager.default.fileExists(atPath: partial.path)
            let diagnosticError = recentErrors[item.itemId]?.1
            let state = cached ? "cached" : diagnosticError != nil ? "failed" : downloading ? "downloading" : "queued"
            let active = cached ? file : partial
            let size = ((try? active.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init)) ?? 0
            inventory.append(CacheDiagnostic(itemId: item.itemId, title: item.title, state: state,
                sizeBytes: size, expectedBytes: item.sizeBytes, error: diagnosticError))
            if !cached { queue.append(DownloadDiagnostic(itemId: item.itemId, title: item.title, state: state,
                bytesDownloaded: size, expectedBytes: item.sizeBytes, error: diagnosticError)) }
        }
        return (inventory, queue)
    }

    func diagnosticErrors() -> [DeviceDiagnosticError] {
        recentErrors.prefix(50).map { itemId, value in
            DeviceDiagnosticError(timestamp: value.0, area: "download", message: value.1, itemId: itemId)
        }
    }

    private func destination(for item: CueItem) -> URL {
        let safe = item.fileExtension?.lowercased().filter { $0.isLetter || $0.isNumber }
        return directory.appendingPathComponent(safe?.isEmpty == false ? "\(item.itemId).\(safe!)" : item.itemId)
    }

    enum CacheError: Error { case downloadFailed }
}
