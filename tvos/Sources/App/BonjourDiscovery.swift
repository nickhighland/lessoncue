import Foundation
import Network
import Combine

@MainActor
final class BonjourDiscovery: ObservableObject {
    @Published private(set) var servers: [DiscoveredServer] = []
    private var browser: NWBrowser?

    func start() {
        let browser = NWBrowser(for: .bonjour(type: "_lessoncue._tcp", domain: nil), using: .tcp)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            let found = results.compactMap { result -> DiscoveredServer? in
                guard case let .service(name, _, _, interface) = result.endpoint else { return nil }
                return DiscoveredServer(name: name, address: "http://\(name).local:8080", interface: interface?.name)
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
