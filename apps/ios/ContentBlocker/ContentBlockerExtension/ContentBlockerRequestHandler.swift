import Foundation

/// Safari Content Blocker Extension.
/// Provides JSON rules to Safari for native content blocking.
///
/// This runs in a separate process — Safari loads the JSON rules
/// and applies them natively (no JavaScript overhead).
class ContentBlockerRequestHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        // Load rules from shared App Group container
        let rules = loadBlockingRules()

        let attachment = NSItemProvider(
            item: rules as NSSecureCoding,
            typeIdentifier: "public.json"
        )

        let item = NSExtensionItem()
        item.attachments = [attachment]
        context.completeRequest(returningItems: [item], completionHandler: nil)
    }

    /// Load compiled JSON rules from shared storage.
    private func loadBlockingRules() -> NSData {
        // Try to load from App Group shared container
        if let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.contentblocker.shared"
        ) {
            let rulesURL = containerURL.appendingPathComponent("blockerList.json")
            if let data = try? Data(contentsOf: rulesURL) {
                return data as NSData
            }
        }

        // Fallback: load bundled default rules
        if let bundledURL = Bundle.main.url(forResource: "blockerList", withExtension: "json"),
           let data = try? Data(contentsOf: bundledURL) {
            return data as NSData
        }

        // Empty rules as last resort
        return "[]".data(using: .utf8)! as NSData
    }
}
