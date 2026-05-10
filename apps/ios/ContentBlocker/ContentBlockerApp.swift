import SwiftUI

/// Content Blocker — Universal App (macOS + iOS + iPadOS)
/// Single codebase with platform-specific adaptations.
@main
struct ContentBlockerApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
        #if os(macOS)
        .windowStyle(.titleBar)
        .defaultSize(width: 800, height: 600)

        Settings {
            SettingsView()
                .environmentObject(appState)
        }
        #endif
    }
}

/// Global app state — manages blocking status, filter lists, statistics.
class AppState: ObservableObject {
    @Published var isEnabled: Bool = true
    @Published var totalBlocked: Int = 0
    @Published var filterLists: [FilterListItem] = []
    @Published var whitelist: [String] = []
    @Published var isSafariExtensionEnabled: Bool = false

    init() {
        loadState()
        checkSafariExtensionStatus()
    }

    func toggle() {
        isEnabled.toggle()
        saveState()
        reloadContentBlocker()
    }

    func addToWhitelist(_ domain: String) {
        guard !domain.isEmpty, !whitelist.contains(domain) else { return }
        whitelist.append(domain)
        saveState()
        reloadContentBlocker()
    }

    func removeFromWhitelist(_ domain: String) {
        whitelist.removeAll { $0 == domain }
        saveState()
        reloadContentBlocker()
    }

    func toggleFilterList(_ id: String) {
        if let index = filterLists.firstIndex(where: { $0.id == id }) {
            filterLists[index].enabled.toggle()
            saveState()
            reloadContentBlocker()
        }
    }

    // MARK: - Private

    private func loadState() {
        let defaults = UserDefaults(suiteName: "group.com.veil.shared")
        isEnabled = defaults?.bool(forKey: "enabled") ?? true
        totalBlocked = defaults?.integer(forKey: "totalBlocked") ?? 0
        whitelist = defaults?.stringArray(forKey: "whitelist") ?? []

        // Default filter lists
        filterLists = [
            FilterListItem(id: "easylist", name: "EasyList", category: "Реклама", enabled: true, rulesCount: 75000),
            FilterListItem(id: "easyprivacy", name: "EasyPrivacy", category: "Трекеры", enabled: true, rulesCount: 30000),
            FilterListItem(id: "fanboy-social", name: "Fanboy Social", category: "Соц. виджеты", enabled: true, rulesCount: 15000),
            FilterListItem(id: "fanboy-annoyance", name: "Fanboy Annoyance", category: "Раздражители", enabled: true, rulesCount: 20000),
            FilterListItem(id: "ruadlist", name: "RU AdList", category: "Региональный", enabled: true, rulesCount: 25000),
        ]
    }

    private func saveState() {
        let defaults = UserDefaults(suiteName: "group.com.veil.shared")
        defaults?.set(isEnabled, forKey: "enabled")
        defaults?.set(totalBlocked, forKey: "totalBlocked")
        defaults?.set(whitelist, forKey: "whitelist")
    }

    private func reloadContentBlocker() {
        #if canImport(SafariServices)
        import SafariServices
        SFContentBlockerManager.reloadContentBlocker(
            withIdentifier: "com.veil.extension",
            completionHandler: { error in
                if let error = error {
                    print("Failed to reload content blocker: \(error)")
                }
            }
        )
        #endif
    }

    private func checkSafariExtensionStatus() {
        #if canImport(SafariServices)
        SFContentBlockerManager.getStateOfContentBlocker(
            withIdentifier: "com.veil.extension"
        ) { state, error in
            DispatchQueue.main.async {
                self.isSafariExtensionEnabled = state?.isEnabled ?? false
            }
        }
        #endif
    }
}

struct FilterListItem: Identifiable {
    let id: String
    var name: String
    var category: String
    var enabled: Bool
    var rulesCount: Int
}
