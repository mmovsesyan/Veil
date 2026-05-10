# Технический дизайн: Content Blocker

## Обзор

Кроссбраузерный блокировщик контента, построенный как монорепозиторий с общим ядром и платформенными адаптерами для Safari, Chrome и Firefox.

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│                   Settings UI                        │
│         (Popup + Options Page + Statistics)          │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  Core Layer                           │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │Rule_Manager │ │Blocking_Engine│ │Statistics    │ │
│  │             │ │              │ │Tracker       │ │
│  └─────────────┘ └──────────────┘ └──────────────┘ │
│  ┌─────────────┐ ┌──────────────┐                   │
│  │Whitelist    │ │Sync_Service  │                   │
│  └─────────────┘ └──────────────┘                   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Platform Adapters                        │
│  ┌───────────────┐ ┌────────────────────────────┐   │
│  │Safari_Adapter │ │WebExtension_Adapter        │   │
│  │(WebKit JSON)  │ │(Chrome MV3 / Firefox)      │   │
│  └───────────────┘ └────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Структура монорепозитория

```
content-blocker/
├── packages/
│   ├── core/                  # Общее ядро (TypeScript)
│   │   ├── src/
│   │   │   ├── engine/        # Blocking Engine
│   │   │   ├── rules/         # Rule Manager + Parser
│   │   │   ├── whitelist/     # Whitelist Manager
│   │   │   ├── stats/         # Statistics Tracker
│   │   │   ├── sync/          # Sync Service
│   │   │   └── types/         # Общие типы и интерфейсы
│   │   └── package.json
│   ├── safari/                # Safari Content Blocker Extension
│   │   ├── src/
│   │   │   ├── adapter/       # Safari Adapter (JSON rules compiler)
│   │   │   └── native/        # Swift/Obj-C bridge (SFContentBlockerManager)
│   │   └── package.json
│   ├── chrome/                # Chrome Extension (Manifest V3)
│   │   ├── src/
│   │   │   ├── background/    # Service Worker
│   │   │   ├── content/       # Content Scripts
│   │   │   └── adapter/       # declarativeNetRequest adapter
│   │   ├── manifest.json
│   │   └── package.json
│   ├── firefox/               # Firefox Extension
│   │   ├── src/
│   │   │   ├── background/    # Background Script
│   │   │   ├── content/       # Content Scripts
│   │   │   └── adapter/       # webRequest adapter
│   │   ├── manifest.json
│   │   └── package.json
│   └── ui/                    # Shared UI Components (React)
│       ├── src/
│       │   ├── popup/         # Popup window
│       │   ├── options/       # Settings page
│       │   ├── statistics/    # Statistics page
│       │   └── components/    # Shared UI components
│       └── package.json
├── filter-lists/              # Предустановленные списки фильтров
├── package.json               # Workspace root
└── tsconfig.json
```

## Модели данных

### Rule (Правило блокировки)

```typescript
interface Rule {
  id: string;
  type: RuleType;
  pattern: string;
  action: RuleAction;
  modifiers: RuleModifiers;
  domains?: DomainConstraint;
  priority: number;
  source: string; // ID списка фильтров или "custom"
}

enum RuleType {
  NetworkBlock = "network-block",
  NetworkAllow = "network-allow",
  CosmeticHide = "cosmetic-hide",
  CosmeticCSS = "cosmetic-css",
  ScriptBlock = "script-block",
}

enum RuleAction {
  Block = "block",
  Allow = "allow",
  CSSDisplayNone = "css-display-none",
  BlockCookies = "block-cookies",
  MakeHTTPS = "make-https",
}

interface RuleModifiers {
  thirdParty?: boolean;
  resourceTypes?: ResourceType[];
  matchCase?: boolean;
}

type ResourceType =
  | "script" | "image" | "stylesheet" | "xmlhttprequest"
  | "media" | "font" | "iframe" | "popup" | "other";

interface DomainConstraint {
  include?: string[];
  exclude?: string[];
}
```

### FilterList (Список фильтров)

```typescript
interface FilterList {
  id: string;
  name: string;
  category: FilterCategory;
  url: string;
  enabled: boolean;
  lastUpdated: number; // timestamp
  rulesCount: number;
  checksum: string;
}

enum FilterCategory {
  Ads = "ads",
  Trackers = "trackers",
  Social = "social",
  Annoyances = "annoyances",
  Regional = "regional",
  Custom = "custom",
}
```

### Settings (Настройки)

```typescript
interface Settings {
  enabled: boolean;
  whitelist: WhitelistEntry[];
  filterLists: FilterList[];
  customRules: string[]; // raw text rules
  updateInterval: number; // hours
  syncEnabled: boolean;
  statisticsEnabled: boolean;
  lastSyncTimestamp: number;
}

interface WhitelistEntry {
  pattern: string; // "example.com" or "*.example.com"
  addedAt: number;
}
```

### Statistics (Статистика)

```typescript
interface PageStats {
  tabId: number;
  url: string;
  blocked: number;
  blockedByCategory: Record<FilterCategory, number>;
}

interface DailyStats {
  date: string; // "YYYY-MM-DD"
  totalBlocked: number;
  byCategory: Record<FilterCategory, number>;
  topDomains: Array<{ domain: string; count: number }>;
}
```

## Ключевые компоненты

### 1. Rule Parser (Парсер правил)

Парсит правила из формата Adblock Plus / uBlock Origin во внутреннее представление.

```typescript
interface IRuleParser {
  parse(rawRule: string): Rule | null;
  parseList(rawText: string): ParseResult;
  format(rule: Rule): string;
}

interface ParseResult {
  rules: Rule[];
  errors: ParseError[];
  skipped: number;
}

interface ParseError {
  line: number;
  content: string;
  reason: string;
}
```

**Свойство round-trip:** `parse(format(parse(raw))) === parse(raw)` для всех поддерживаемых правил.

### 2. Blocking Engine

Высокопроизводительный движок сопоставления URL с правилами.

```typescript
interface IBlockingEngine {
  initialize(rules: Rule[]): Promise<void>;
  addRules(rules: Rule[]): void;
  removeRules(sourceId: string): void;
  shouldBlock(request: NetworkRequest): BlockDecision;
  getCosmeticRules(domain: string): CosmeticRule[];
}

interface NetworkRequest {
  url: string;
  type: ResourceType;
  initiatorDomain: string;
  targetDomain: string;
}

interface BlockDecision {
  blocked: boolean;
  matchedRule?: Rule;
  action: RuleAction;
}
```

**Реализация:** Используется структура данных на основе Trie + хеш-таблица доменов для O(1) lookup по домену и быстрого сопоставления паттернов.

### 3. Platform Adapter Interface

```typescript
interface IPlatformAdapter {
  initialize(): Promise<void>;
  applyRules(rules: Rule[]): Promise<void>;
  updateRules(added: Rule[], removed: string[]): Promise<void>;
  getActiveTabInfo(): Promise<TabInfo>;
  setBadgeCount(tabId: number, count: number): void;
  onNavigationEvent(callback: NavigationCallback): void;
}
```

### 4. Safari Adapter

```typescript
interface ISafariAdapter extends IPlatformAdapter {
  compileToWebKitJSON(rules: Rule[]): WebKitRule[];
  splitIntoExtensions(rules: WebKitRule[], limit: number): WebKitRule[][];
  reloadContentBlocker(identifier: string): Promise<void>;
}

interface WebKitRule {
  trigger: {
    "url-filter": string;
    "resource-type"?: string[];
    "if-domain"?: string[];
    "unless-domain"?: string[];
    "load-type"?: string[];
  };
  action: {
    type: "block" | "block-cookies" | "css-display-none" | "ignore-previous-rules" | "make-https";
    selector?: string;
  };
}
```

### 5. WebExtension Adapter (Chrome)

```typescript
interface IChromeAdapter extends IPlatformAdapter {
  compileToDeclarativeNetRequest(rules: Rule[]): chrome.declarativeNetRequest.Rule[];
  updateDynamicRules(rules: chrome.declarativeNetRequest.Rule[]): Promise<void>;
  updateStaticRulesets(rulesets: RulesetConfig[]): Promise<void>;
  injectCosmeticStyles(tabId: number, css: string): Promise<void>;
}
```

### 6. Sync Service

```typescript
interface ISyncService {
  initialize(userId: string): Promise<void>;
  push(changes: SettingsChange[]): Promise<void>;
  pull(): Promise<Settings>;
  resolveConflict(local: Settings, remote: Settings): Settings;
  onConflict(callback: ConflictCallback): void;
}

interface SettingsChange {
  key: string;
  value: unknown;
  timestamp: number;
  deviceId: string;
}
```

## Технологический стек

| Компонент | Технология |
|-----------|-----------|
| Язык | TypeScript 5.x |
| Сборка | Vite + Rollup |
| Монорепо | pnpm workspaces |
| UI | React 18 + Tailwind CSS |
| Хранилище (браузер) | IndexedDB (правила), chrome.storage (настройки) |
| Хранилище (Safari) | UserDefaults + App Groups |
| Синхронизация | Firebase Realtime Database или Supabase |
| Тестирование | Vitest + fast-check (property-based) |
| Линтинг | ESLint + Prettier |
| CI/CD | GitHub Actions |

## Свойства корректности (для property-based тестирования)

1. **Round-trip парсинга:** Для любого валидного правила: `parse(format(rule)) ≡ rule`
2. **Идемпотентность whitelist:** Добавление домена дважды не создаёт дубликатов
3. **Полнота блокировки:** Если правило активно и URL соответствует паттерну — запрос блокируется
4. **Приоритет исключений:** Allow-правило всегда имеет приоритет над block-правилом для того же URL
5. **Лимиты Safari:** Компилятор никогда не генерирует более 150 000 правил на расширение
6. **Лимиты Chrome:** Адаптер никогда не превышает 30 000 динамических правил
7. **Консистентность синхронизации:** После push + pull настройки идентичны исходным (при отсутствии конфликтов)

## Потоки данных

### Загрузка страницы (Chrome)

```
1. Service Worker перехватывает onBeforeRequest
2. BlockingEngine.shouldBlock(request) → решение за <1ms
3. Если blocked → cancel request + Statistics.increment()
4. Content Script получает косметические правила для домена
5. Content Script скрывает DOM-элементы
6. Badge обновляется с количеством заблокированных
```

### Обновление списка фильтров

```
1. Rule_Manager проверяет URL списка (каждые 24ч)
2. Сравнивает checksum с текущим
3. Если изменился → скачивает новый список
4. Parser парсит правила → внутреннее представление
5. BlockingEngine.removeRules(listId) + addRules(newRules)
6. Platform Adapter перекомпилирует правила для браузера
```

## Ограничения и компромиссы

- **Safari:** Нет динамической блокировки — только декларативные JSON-правила. Косметическая фильтрация ограничена css-display-none.
- **Chrome MV3:** Нет webRequest.onBeforeRequest для блокировки. Только declarativeNetRequest с лимитами.
- **Firefox:** Поддерживает webRequest, но планирует переход на MV3. Код должен поддерживать оба API.
- **Синхронизация:** Требует аккаунт пользователя. Без аккаунта — только локальное хранение.
