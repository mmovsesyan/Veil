import SwiftUI

/// Main view — shows blocking status, stats, and quick controls.
struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationView {
            List {
                // Status Section
                Section {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Content Blocker")
                                .font(.headline)
                            Text(appState.isEnabled ? "Защита активна" : "Отключено")
                                .font(.subheadline)
                                .foregroundColor(appState.isEnabled ? .green : .red)
                        }
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { appState.isEnabled },
                            set: { _ in appState.toggle() }
                        ))
                        .labelsHidden()
                    }
                    .padding(.vertical, 8)

                    // Safari Extension Status
                    if !appState.isSafariExtensionEnabled {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                            VStack(alignment: .leading) {
                                Text("Safari расширение не активно")
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                Text("Настройки → Safari → Расширения")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }

                // Statistics
                Section("Статистика") {
                    HStack {
                        Label("Заблокировано", systemImage: "shield.fill")
                        Spacer()
                        Text("\(appState.totalBlocked)")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(.blue)
                    }
                }

                // Filter Lists
                Section("Списки фильтров") {
                    ForEach(appState.filterLists) { list in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(list.name)
                                    .font(.body)
                                Text("\(list.category) · \(list.rulesCount / 1000)K правил")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Toggle("", isOn: Binding(
                                get: { list.enabled },
                                set: { _ in appState.toggleFilterList(list.id) }
                            ))
                            .labelsHidden()
                        }
                    }
                }

                // Whitelist
                Section("Белый список") {
                    if appState.whitelist.isEmpty {
                        Text("Нет исключений")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(appState.whitelist, id: \.self) { domain in
                            HStack {
                                Text(domain)
                                    .font(.body.monospaced())
                                Spacer()
                                Button(role: .destructive) {
                                    appState.removeFromWhitelist(domain)
                                } label: {
                                    Image(systemName: "trash")
                                }
                            }
                        }
                    }

                    AddDomainRow { domain in
                        appState.addToWhitelist(domain)
                    }
                }

                // About
                Section("О приложении") {
                    HStack {
                        Text("Версия")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }
                    Link("Исходный код", destination: URL(string: "https://github.com/contentblocker")!)
                }
            }
            .navigationTitle("Content Blocker")
            #if os(iOS)
            .listStyle(.insetGrouped)
            #endif
        }
    }
}

struct AddDomainRow: View {
    @State private var newDomain = ""
    var onAdd: (String) -> Void

    var body: some View {
        HStack {
            TextField("example.com", text: $newDomain)
                .textFieldStyle(.roundedBorder)
                #if os(iOS)
                .autocapitalization(.none)
                .keyboardType(.URL)
                #endif
            Button("Добавить") {
                let domain = newDomain.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !domain.isEmpty else { return }
                onAdd(domain)
                newDomain = ""
            }
            .disabled(newDomain.isEmpty)
        }
    }
}

#if os(macOS)
struct SettingsView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        TabView {
            ContentView()
                .tabItem { Label("Основные", systemImage: "gear") }
        }
        .frame(width: 500, height: 400)
    }
}
#endif
