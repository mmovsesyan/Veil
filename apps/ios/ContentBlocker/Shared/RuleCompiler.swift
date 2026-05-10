import Foundation

/// Compiles filter list rules into Safari Content Blocker JSON format.
/// Shared between the main app and the Content Blocker extension.
struct RuleCompiler {

    /// Compile text filter rules into WebKit JSON format.
    static func compile(filterText: String, whitelist: [String]) -> Data {
        var rules: [[String: Any]] = []

        let lines = filterText.components(separatedBy: .newlines)
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty,
                  !trimmed.hasPrefix("!"),
                  !trimmed.hasPrefix("[") else { continue }

            if let rule = parseRule(trimmed) {
                rules.append(rule)
            }

            // Safari limit: 150,000 rules per extension
            if rules.count >= 149000 { break }
        }

        // Add whitelist rules (ignore-previous-rules)
        for domain in whitelist {
            rules.append([
                "trigger": ["url-filter": ".*", "if-domain": ["*\(domain)"]],
                "action": ["type": "ignore-previous-rules"]
            ])
        }

        let data = try? JSONSerialization.data(withJSONObject: rules, options: [])
        return data ?? "[]".data(using: .utf8)!
    }

    /// Parse a single Adblock Plus rule into WebKit JSON format.
    private static func parseRule(_ raw: String) -> [String: Any]? {
        // Exception rules
        if raw.hasPrefix("@@") {
            let pattern = String(raw.dropFirst(2))
            guard let urlFilter = convertToRegex(pattern) else { return nil }
            return [
                "trigger": ["url-filter": urlFilter],
                "action": ["type": "ignore-previous-rules"]
            ]
        }

        // Cosmetic rules
        if raw.contains("##") {
            let parts = raw.components(separatedBy: "##")
            let domains = parts[0]
            let selector = parts.count > 1 ? parts[1] : ""
            guard !selector.isEmpty else { return nil }

            var trigger: [String: Any] = ["url-filter": ".*"]
            if !domains.isEmpty {
                let domainList = domains.components(separatedBy: ",")
                    .map { "*\($0.trimmingCharacters(in: .whitespaces))" }
                trigger["if-domain"] = domainList
            }

            return [
                "trigger": trigger,
                "action": ["type": "css-display-none", "selector": selector]
            ]
        }

        // Network rules
        let (pattern, modifiers) = splitModifiers(raw)
        guard let urlFilter = convertToRegex(pattern) else { return nil }

        var trigger: [String: Any] = ["url-filter": urlFilter]

        // Resource types
        let resourceTypes = extractResourceTypes(modifiers)
        if !resourceTypes.isEmpty {
            trigger["resource-type"] = resourceTypes
        }

        // Third-party
        if modifiers.contains("third-party") {
            trigger["load-type"] = ["third-party"]
        } else if modifiers.contains("~third-party") {
            trigger["load-type"] = ["first-party"]
        }

        // Domain constraints
        let domains = extractDomains(modifiers)
        if !domains.include.isEmpty {
            trigger["if-domain"] = domains.include.map { "*\($0)" }
        }
        if !domains.exclude.isEmpty {
            trigger["unless-domain"] = domains.exclude.map { "*\($0)" }
        }

        return [
            "trigger": trigger,
            "action": ["type": "block"]
        ]
    }

    private static func convertToRegex(_ pattern: String) -> String? {
        var result = pattern

        // Domain anchor
        if result.hasPrefix("||") {
            result = String(result.dropFirst(2))
            let domain = result.replacingOccurrences(of: "^", with: "")
            let escaped = NSRegularExpression.escapedPattern(for: domain)
            return "^https?://([^/]*\\.)?\(escaped)"
        }

        // Remove separator
        result = result.replacingOccurrences(of: "^", with: "[^a-zA-Z0-9_.%-]")

        // Wildcards
        result = result.replacingOccurrences(of: "*", with: ".*")

        // Escape special chars (except those we already converted)
        let specialChars = CharacterSet(charactersIn: "+?{}()|[]\\")
        var escaped = ""
        for char in result.unicodeScalars {
            if specialChars.contains(char) {
                escaped += "\\\(char)"
            } else {
                escaped += String(char)
            }
        }

        return escaped.isEmpty ? nil : escaped
    }

    private static func splitModifiers(_ raw: String) -> (String, [String]) {
        guard let dollarIdx = raw.lastIndex(of: "$") else {
            return (raw, [])
        }
        let pattern = String(raw[..<dollarIdx])
        let modStr = String(raw[raw.index(after: dollarIdx)...])
        let mods = modStr.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        return (pattern, mods)
    }

    private static func extractResourceTypes(_ modifiers: [String]) -> [String] {
        let mapping: [String: String] = [
            "script": "script",
            "image": "image",
            "stylesheet": "style-sheet",
            "xmlhttprequest": "raw",
            "media": "media",
            "font": "font",
            "subdocument": "document",
        ]
        return modifiers.compactMap { mapping[$0] }
    }

    private static func extractDomains(_ modifiers: [String]) -> (include: [String], exclude: [String]) {
        guard let domainMod = modifiers.first(where: { $0.hasPrefix("domain=") }) else {
            return ([], [])
        }
        let value = String(domainMod.dropFirst("domain=".count))
        let parts = value.components(separatedBy: "|")

        var include: [String] = []
        var exclude: [String] = []
        for part in parts {
            if part.hasPrefix("~") {
                exclude.append(String(part.dropFirst()))
            } else {
                include.append(part)
            }
        }
        return (include, exclude)
    }
}
