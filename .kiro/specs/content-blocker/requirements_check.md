# Requirements Document: Content Blocker

## Introduction

Content Blocker is a cross-browser content blocking service (ads, trackers, social widgets and other unwanted elements), similar to 1Blocker. The system supports Safari via Content Blocker API (WebKit), as well as Chrome and Firefox via WebExtensions API. Users can manage blocking rules, create custom filters, and control privacy levels.

## Glossary

- **Content_Blocker**: Main system for blocking unwanted content on web pages
- **Blocking_Engine**: Engine for processing and applying blocking rules to network requests and DOM elements
- **Rule_Manager**: Component for managing rules and filter lists
- **Filter_List**: Set of blocking rules grouped by category (ads, trackers, social widgets)
- **Custom_Rule**: User-created blocking rule
- **Safari_Adapter**: Adapter for Safari Content Blocker API (WebKit JSON rules)
- **WebExtension_Adapter**: Adapter for WebExtensions API (Chrome, Firefox)
- **Settings_UI**: User interface for managing settings and blocking rules
- **Whitelist**: List of domains excluded from blocking
- **Statistics_Tracker**: Component for collecting and displaying blocking statistics

## Requirements

### Requirement 1: Ad Blocking

**User Story:** As a user, I want to block ads on web pages to improve loading speed and visual content perception.

#### Acceptance Criteria

1. WHEN a page loads, THE Blocking_Engine SHALL intercept network requests to ad domains and block them before receiving a response
2. WHEN a page renders, THE Blocking_Engine SHALL hide DOM elements matching cosmetic filter rules
3. WHEN an ad request is blocked, THE Statistics_Tracker SHALL increment the blocked elements counter for the current page
4. IF a network request does not match any blocking rule, THEN THE Blocking_Engine SHALL pass the request without modification

### Requirement 2: Tracker Blocking

**User Story:** As a user, I want to block trackers and tracking scripts to protect my privacy online.

#### Acceptance Criteria

1. WHEN a page loads, THE Blocking_Engine SHALL block requests to known tracking domains from active filter lists
2. WHEN a tracking script is detected in the DOM, THE Blocking_Engine SHALL prevent its execution
3. THE Content_Blocker SHALL support blocking the following tracker types: analytics scripts, tracking pixels, fingerprinting scripts, cross-site cookie trackers

### Requirement 3: Social Widget Blocking

**User Story:** As a user, I want to block social widgets (share buttons, embedded posts) to prevent tracking by social networks.

#### Acceptance Criteria

1. WHEN a page contains social network widgets, THE Blocking_Engine SHALL block loading of external resources for those widgets
2. WHEN a social widget is blocked, THE Content_Blocker SHALL display a placeholder with an option to load the widget once on user click
3. THE Content_Blocker SHALL support blocking widgets from: Facebook, Twitter/X, Instagram, LinkedIn, VKontakte

### Requirement 4: Filter List Management

**User Story:** As a user, I want to manage filter lists to customize blocking to my needs.

#### Acceptance Criteria

1. THE Rule_Manager SHALL provide preset filter lists by categories: ads, trackers, social widgets, annoyances, regional filters
2. WHEN a user activates a filter list, THE Rule_Manager SHALL load rules from that list into the Blocking_Engine within 2 seconds
3. WHEN a user deactivates a filter list, THE Rule_Manager SHALL remove rules of that list from the Blocking_Engine
4. WHEN a filter list update is available, THE Rule_Manager SHALL download the updated version and apply new rules
5. THE Rule_Manager SHALL check for filter list updates every 24 hours

### Requirement 5: Custom Rules

**User Story:** As an advanced user, I want to create custom blocking rules to block specific elements on specific sites.

#### Acceptance Criteria

1. WHEN a user creates a custom rule, THE Rule_Manager SHALL validate the rule syntax and save it to storage
2. WHEN a custom rule is saved, THE Blocking_Engine SHALL apply the rule to subsequent page loads
3. THE Rule_Manager SHALL support rule syntax compatible with Adblock Plus and uBlock Origin formats
4. IF a custom rule contains a syntax error, THEN THE Rule_Manager SHALL display an error message indicating the position and type of error
5. WHEN a user imports an external rule list by URL, THE Rule_Manager SHALL download, validate, and add rules to the system

### Requirement 6: Whitelist (Exceptions)

**User Story:** As a user, I want to add sites to a whitelist to disable blocking on trusted resources.

#### Acceptance Criteria

1. WHEN a user adds a domain to the Whitelist, THE Blocking_Engine SHALL stop blocking on that domain
2. WHEN a user removes a domain from the Whitelist, THE Blocking_Engine SHALL resume blocking on that domain
3. WHEN a user clicks the quick disable button on the current site, THE Content_Blocker SHALL add the current domain to the Whitelist and reload the page
4. THE Whitelist SHALL support both full domains and wildcard patterns (e.g., *.example.com)

### Requirement 7: Safari Content Blocker API Support

**User Story:** As a Safari user, I want to use the native Content Blocker API for maximum blocking performance.

#### Acceptance Criteria

1. THE Safari_Adapter SHALL convert internal blocking rules to WebKit Content Blocker API JSON rule format
2. WHEN rules are updated, THE Safari_Adapter SHALL recompile JSON rules and pass them to Safari via SFContentBlockerManager
3. WHILE the number of rules exceeds the Safari limit (150,000 rules), THE Safari_Adapter SHALL split rules into multiple Content Blocker extensions
4. THE Safari_Adapter SHALL support WebKit action types: block, block-cookies, css-display-none, ignore-previous-rules, make-https

### Requirement 8: WebExtensions API Support

**User Story:** As a Chrome or Firefox user, I want to use a content blocking extension to get protection in my browser.

#### Acceptance Criteria

1. THE WebExtension_Adapter SHALL use declarativeNetRequest API (Manifest V3) for Chrome and webRequest API for Firefox
2. WHEN blocking rules are updated, THE WebExtension_Adapter SHALL update dynamic rules via the corresponding browser API
3. WHILE the browser is Chrome, THE WebExtension_Adapter SHALL respect the 30,000 dynamic rules limit and use static rulesets for the rest
4. THE WebExtension_Adapter SHALL support cosmetic filtering via content scripts for hiding DOM elements

### Requirement 9: User Interface

**User Story:** As a user, I want a convenient interface for managing the blocker to easily configure blocking parameters.

#### Acceptance Criteria

1. THE Settings_UI SHALL display a popup window with current blocking status when clicking the extension icon
2. THE Settings_UI SHALL display the number of blocked elements on the current page as a badge on the extension icon
3. WHEN a user opens the settings page, THE Settings_UI SHALL display filter categories with activation toggles
4. THE Settings_UI SHALL provide a custom rules management page with a text editor and syntax highlighting
5. THE Settings_UI SHALL provide a statistics page with graphs of blocked elements per day, week, and month

### Requirement 10: Performance

**User Story:** As a user, I want the blocker to work fast and not slow down page loading to maintain a comfortable browsing experience.

#### Acceptance Criteria

1. WHEN a page loads, THE Blocking_Engine SHALL make a blocking decision for a network request in no more than 1 millisecond per rule
2. THE Blocking_Engine SHALL use no more than 50 MB of RAM with 300,000 rules loaded
3. WHEN the extension initializes, THE Blocking_Engine SHALL load rules and be ready to work within 500 milliseconds
4. THE Content_Blocker SHALL increase CPU consumption by no more than 5% during active page operation

### Requirement 11: Settings Synchronization

**User Story:** As a multi-device user, I want to synchronize blocker settings between devices so I don't have to configure each device separately.

#### Acceptance Criteria

1. WHEN a user changes settings on one device, THE Content_Blocker SHALL synchronize changes with cloud storage
2. WHEN a device connects to the network, THE Content_Blocker SHALL download current settings from cloud storage
3. IF a synchronization conflict occurs, THEN THE Content_Blocker SHALL apply a "last change wins" strategy and notify the user about the conflict
4. THE Content_Blocker SHALL synchronize: whitelist, active filter lists, custom rules, general settings

### Requirement 12: Filter Rule Parsing and Compilation

**User Story:** As a system, I want to correctly parse rules from various filter formats to ensure compatibility with existing blocking lists.

#### Acceptance Criteria

1. WHEN a filter list is loaded, THE Rule_Manager SHALL parse rules from Adblock Plus / uBlock Origin format into internal representation
2. THE Rule_Manager SHALL support parsing: basic blocking rules, exception rules, cosmetic rules, extended CSS rules, rules with modifiers (domain, third-party, script, image)
3. THE Rule_Manager SHALL format internal rule representation back to Adblock Plus text format
4. FOR ALL valid filter rules, parsing to internal representation, then formatting back to text, then re-parsing SHALL produce an equivalent internal representation (round-trip property)
5. IF a rule contains unsupported syntax, THEN THE Rule_Manager SHALL skip the rule and log a warning
