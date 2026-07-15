import Foundation
import Security

enum CredentialStore {
    private static let service = "org.lessoncue.tv.device"
    private static let account = "paired-screen"

    static func save(_ identity: DeviceIdentity) throws {
        let data = try JSONEncoder().encode(identity)
        SecItemDelete(query as CFDictionary)
        var values = query
        values[kSecValueData as String] = data
        values[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(values as CFDictionary, nil) == errSecSuccess else { throw StoreError.writeFailed }
    }

    static func load() -> DeviceIdentity? {
        var values = query
        values[kSecReturnData as String] = true
        values[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(values as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(DeviceIdentity.self, from: data)
    }

    static func clear() { SecItemDelete(query as CFDictionary) }

    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    enum StoreError: Error { case writeFailed }
}
