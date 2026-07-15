import Foundation

enum ManifestStore {
    private static var url: URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root.appendingPathComponent("lessoncue-manifest.json")
    }

    static func save(_ manifest: ScreenManifest) throws {
        try JSONEncoder.lessonCue.encode(manifest).write(to: url, options: .atomic)
    }

    static func load() -> ScreenManifest? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? LessonCueJSON.decoder.decode(ScreenManifest.self, from: data)
    }
}

private extension JSONEncoder {
    static let lessonCue: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}
