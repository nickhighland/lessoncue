import Foundation
import Network
import Combine

@MainActor
final class BonjourDiscovery: ObservableObject {
    @Published private(set) var servers: [DiscoveredServer] = []
    private var browser: NWBrowser?

    func start() {
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_lessoncue._tcp", domain: nil), using: .tcp)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            let found = results.compactMap { result -> DiscoveredServer? in
                guard case let .service(name, _, _, interface) = result.endpoint else { return nil }
                var port = 8080 // Legacy LessonCue advertisements did not include a port TXT record.
                if case let .bonjour(record) = result.metadata,
                   case let .string(value)? = record.getEntry(for: "port"),
                   let advertisedPort = Int(value), (1...65535).contains(advertisedPort) {
                    port = advertisedPort
                }
                let suffix = port == 80 ? "" : ":\(port)"
                return DiscoveredServer(name: name, address: "http://\(name).local\(suffix)", interface: interface?.name)
            }
            Task { @MainActor in self?.servers = found }
        }
        browser.start(queue: .global(qos: .userInitiated))
        self.browser = browser
    }

    deinit { browser?.cancel() }
}

struct DiscoveredServer: Identifiable, Hashable {
    let name: String
    let address: String
    let interface: String?
    var id: String { "\(name)-\(interface ?? "network")" }
}
