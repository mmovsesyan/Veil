# Chrome Web Store Listing

## Name
Veil — Ad & Tracker Blocker

## Short Description (132 chars max)
Block ads, trackers & social widgets. 1.7M req/s engine, 116 scriptlets, auto-learning. Fast, private, open source.

## Description
Veil is a high-performance content blocker for Chrome that eliminates ads, trackers, and annoyances while keeping your browsing fast and private.

⚡ BLAZING FAST ENGINE
• Token-bucket matching engine: 1.7M requests/sec throughput
• Sub-microsecond latency (0.6μs per request)
• 300K rules loaded in 250ms, cached cold start in <50ms
• Minimal memory footprint (~48MB for 300K rules)

🚫 COMPREHENSIVE AD BLOCKING
• Banner ads, video ads, pop-ups, interstitials
• Pre-roll and mid-roll video ads
• Anti-adblock bypass with 116 scriptlets
• $redirect — serve neutered resources (noop.js, 1x1.gif) instead of blocking

🔒 PRIVACY PROTECTION
• Tracker and analytics blocking
• $removeparam — strip tracking parameters (utm_*, fbclid, gclid) from URLs
• $csp injection — Content-Security-Policy header modification
• CNAME uncloaking — detect trackers hiding behind first-party DNS records
• Fingerprinting protection

👥 SOCIAL WIDGET CONTROL
• Block Facebook, Twitter, Instagram, LinkedIn, VK widgets
• One-click load with placeholder UI
• No social tracking until you choose to interact

🧠 AUTO-LEARNING ENGINE
• Automatically discovers and blocks new ad patterns
• Adapts to site changes without manual rule updates
• Engine serialization for instant startup

📊 STATISTICS & INSIGHTS
• Per-tab blocking stats
• Daily and weekly charts
• See exactly what's being blocked

🔧 ADVANCED FEATURES
• 30+ filter modifiers (full ABP/uBlock Origin/AdGuard compatibility)
• Extended CSS selectors (#?#) for complex element hiding
• Element picker — create rules by clicking elements
• Custom user rules with full syntax support
• Cross-device sync with conflict resolution
• Whitelist with wildcard patterns

📋 FILTER LIST SUPPORT
• EasyList, EasyPrivacy, uBlock filters, AdGuard Base
• Peter Lowe's List, Fanboy Social, Fanboy Annoyances
• Regional lists (RU AdList and more)
• Automatic updates

OPEN SOURCE
Veil is fully open source under the MIT license. No ads. No tracking. No data collection. Your browsing is yours.

## Category
Productivity

## Language
English, Russian

## Privacy Policy URL
https://contentblocker.app/privacy

## Version
1.0.0

## Permissions Justification
- declarativeNetRequest: Block ad and tracker network requests using Chrome's native API
- declarativeNetRequestFeedback: Provide per-tab blocking statistics to the user
- storage: Save user settings, custom rules, and filter list cache
- tabs: Show blocked request count badge per tab
- webNavigation: Inject cosmetic filtering rules on page load
- activeTab: Apply whitelist toggle for the current site
- scripting: Inject CSS for element hiding and scriptlets for anti-adblock bypass
- alarms: Schedule periodic filter list updates
- host_permissions (<all_urls>): Required to block requests and apply cosmetic rules on all websites
