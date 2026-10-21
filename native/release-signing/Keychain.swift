import Foundation
import Security

// Developer-only bootstrap; no certificate trust settings are changed.
let service = "com.cemsarp.zoomtime.release-signing"
func password() throws -> String {
    let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: "recovery-password", kSecReturnData: true]
    var found: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &found)
    if status == errSecSuccess, let data = found as? Data, let value = String(data: data, encoding: .utf8) { return value }
    guard status == errSecItemNotFound else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    var bytes = [UInt8](repeating: 0, count: 48)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw NSError(domain: "Signing", code: 1) }
    let value = Data(bytes).base64EncodedString()
    let add: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: "recovery-password", kSecValueData: Data(value.utf8)]
    let saved = SecItemAdd(add as CFDictionary, nil)
    guard saved == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(saved)) }
    return value
}
do {
    let command = CommandLine.arguments[1]
    if command == "password" { print(try password()) }
    else if command == "import" {
        var keychain: SecKeychain?
        guard SecKeychainCopyDefault(&keychain) == errSecSuccess, let keychain else { throw NSError(domain: "Signing", code: 2) }
        var trusted: SecTrustedApplication?
        guard SecTrustedApplicationCreateFromPath("/usr/bin/codesign", &trusted) == errSecSuccess, let trusted else { throw NSError(domain: "Signing", code: 3) }
        var access: SecAccess?
        guard SecAccessCreate("ZoomTime Private Release Signing" as CFString, [trusted] as CFArray, &access) == errSecSuccess, let access else { throw NSError(domain: "Signing", code: 4) }
        let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))
        var items: CFArray?
        let status = SecPKCS12Import(data as CFData, [kSecImportExportPassphrase: try password(), kSecImportExportKeychain: keychain, kSecImportExportAccess: access] as CFDictionary, &items)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
        print("Signing identity imported; no trust settings changed.")
    } else { throw NSError(domain: "Signing", code: 5) }
} catch {
    // No input, key material or passwords in diagnostics.
    fputs("Signing Keychain setup failed (\((error as NSError).code)). Unlock your login Keychain and retry.\n", stderr)
    exit(1)
}
