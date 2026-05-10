use wasm_bindgen::prelude::*;
use std::collections::{HashMap, HashSet};

/// High-performance pattern matching engine compiled to WebAssembly.
/// 
/// This is the hot path of the content blocker — called for every network request.
/// WASM gives ~5-10x speedup over equivalent JavaScript for string operations.
///
/// Architecture:
/// - Hostname hash set for O(1) domain blocking
/// - Token-bucket index for O(tokens_in_url) pattern matching
/// - Boyer-Moore-Horspool for substring search
/// - Flat memory layout for cache efficiency

#[wasm_bindgen]
pub struct WasmEngine {
    /// Hostname-only block rules: O(1) lookup
    hostname_block: HashSet<String>,
    /// Hostname-only allow rules: O(1) lookup
    hostname_allow: HashSet<String>,
    /// Token → rule indices mapping
    token_buckets: HashMap<String, Vec<usize>>,
    /// All rule patterns (flat storage)
    patterns: Vec<Pattern>,
    /// Generic rules (no good token)
    generic_rules: Vec<usize>,
}

struct Pattern {
    raw: String,
    pattern_type: PatternType,
    is_allow: bool,
    third_party: Option<bool>,
    resource_types: u16, // bitmap
}

#[derive(Clone, Copy)]
enum PatternType {
    DomainAnchor,  // ||domain.com^
    Prefix,        // |https://...
    Contains,      // plain substring
    Wildcard,      // *pattern*
}

// Resource type bits (must match TypeScript side)
const TYPE_SCRIPT: u16 = 0x001;
const TYPE_IMAGE: u16 = 0x002;
const TYPE_STYLESHEET: u16 = 0x004;
const TYPE_XHR: u16 = 0x008;
const TYPE_MEDIA: u16 = 0x010;
const TYPE_FONT: u16 = 0x020;
const TYPE_IFRAME: u16 = 0x040;
const TYPE_POPUP: u16 = 0x080;
const TYPE_OTHER: u16 = 0x100;

#[wasm_bindgen]
impl WasmEngine {
    /// Create a new empty engine.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            hostname_block: HashSet::new(),
            hostname_allow: HashSet::new(),
            token_buckets: HashMap::new(),
            patterns: Vec::new(),
            generic_rules: Vec::new(),
        }
    }

    /// Add a hostname-only block rule. O(1) insertion.
    pub fn add_hostname_block(&mut self, hostname: &str) {
        self.hostname_block.insert(hostname.to_lowercase());
    }

    /// Add a hostname-only allow rule.
    pub fn add_hostname_allow(&mut self, hostname: &str) {
        self.hostname_allow.insert(hostname.to_lowercase());
    }

    /// Add a pattern rule with token indexing.
    pub fn add_rule(
        &mut self,
        raw_pattern: &str,
        is_allow: bool,
        third_party: i8, // -1 = any, 0 = first-party, 1 = third-party
        resource_types: u16,
    ) {
        let pattern_type = classify_pattern(raw_pattern);
        let idx = self.patterns.len();

        self.patterns.push(Pattern {
            raw: raw_pattern.to_lowercase(),
            pattern_type,
            is_allow,
            third_party: match third_party {
                0 => Some(false),
                1 => Some(true),
                _ => None,
            },
            resource_types,
        });

        // Extract token for bucket indexing
        let token = extract_best_token(raw_pattern);
        if token.len() >= 4 {
            self.token_buckets
                .entry(token)
                .or_insert_with(Vec::new)
                .push(idx);
        } else {
            self.generic_rules.push(idx);
        }
    }

    /// Check if a URL should be blocked.
    /// Returns: 0 = allow, 1 = block, 2 = no match
    pub fn should_block(
        &self,
        url: &str,
        hostname: &str,
        initiator_hostname: &str,
        resource_type: u16,
    ) -> u8 {
        let lower_url = url.to_lowercase();
        let lower_host = hostname.to_lowercase();
        let is_third_party = lower_host != initiator_hostname.to_lowercase();

        // Step 1: Hostname allow (O(1))
        if self.hostname_allow.contains(&lower_host) {
            return 0; // allow
        }
        // Check parent domains for allow
        if let Some(pos) = lower_host.find('.') {
            let parent = &lower_host[pos + 1..];
            if self.hostname_allow.contains(parent) {
                return 0;
            }
        }

        // Step 2: Hostname block (O(1))
        if self.hostname_block.contains(&lower_host) {
            return 1; // block
        }
        // Check parent domains
        let parts: Vec<&str> = lower_host.split('.').collect();
        for i in 1..parts.len().saturating_sub(1) {
            let parent = parts[i..].join(".");
            if self.hostname_block.contains(&parent) {
                return 1;
            }
        }

        // Step 3: Token-bucket matching
        let tokens = extract_url_tokens(&lower_url);
        for token in &tokens {
            if let Some(bucket) = self.token_buckets.get(token.as_str()) {
                for &idx in bucket {
                    let pattern = &self.patterns[idx];
                    if self.matches_pattern(pattern, &lower_url, is_third_party, resource_type) {
                        return if pattern.is_allow { 0 } else { 1 };
                    }
                }
            }
        }

        // Step 4: Generic rules (fallback)
        for &idx in &self.generic_rules {
            let pattern = &self.patterns[idx];
            if self.matches_pattern(pattern, &lower_url, is_third_party, resource_type) {
                return if pattern.is_allow { 0 } else { 1 };
            }
        }

        2 // no match
    }

    /// Get number of rules loaded.
    pub fn rule_count(&self) -> usize {
        self.hostname_block.len() + self.hostname_allow.len() + self.patterns.len()
    }

    /// Get memory usage estimate in bytes.
    pub fn memory_usage(&self) -> usize {
        let hostnames = (self.hostname_block.len() + self.hostname_allow.len()) * 32;
        let patterns: usize = self.patterns.iter().map(|p| p.raw.len() + 16).sum();
        let buckets = self.token_buckets.len() * 48;
        hostnames + patterns + buckets
    }
}

impl WasmEngine {
    fn matches_pattern(
        &self,
        pattern: &Pattern,
        url: &str,
        is_third_party: bool,
        resource_type: u16,
    ) -> bool {
        // Resource type check (bitmap)
        if pattern.resource_types != 0 && (pattern.resource_types & resource_type) == 0 {
            return false;
        }

        // Third-party check
        if let Some(tp) = pattern.third_party {
            if tp != is_third_party {
                return false;
            }
        }

        // Pattern matching
        match pattern.pattern_type {
            PatternType::DomainAnchor => {
                let domain = pattern.raw.trim_start_matches("||").trim_end_matches('^');
                match_domain_anchor(url, domain)
            }
            PatternType::Prefix => {
                let prefix = pattern.raw.trim_start_matches('|');
                url.starts_with(prefix)
            }
            PatternType::Contains => {
                // Boyer-Moore-Horspool
                bmh_search(url.as_bytes(), pattern.raw.as_bytes())
            }
            PatternType::Wildcard => {
                match_wildcard(&pattern.raw, url)
            }
        }
    }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

fn classify_pattern(pattern: &str) -> PatternType {
    let lower = pattern.to_lowercase();
    if lower.starts_with("||") {
        PatternType::DomainAnchor
    } else if lower.starts_with('|') && !lower.starts_with("||") {
        PatternType::Prefix
    } else if lower.contains('*') {
        PatternType::Wildcard
    } else {
        PatternType::Contains
    }
}

fn extract_best_token(pattern: &str) -> String {
    let mut cleaned = pattern.to_lowercase();
    if cleaned.starts_with("||") {
        cleaned = cleaned[2..].to_string();
    }
    if cleaned.starts_with("@@") {
        cleaned = cleaned[2..].to_string();
    }

    cleaned
        .split(|c: char| !c.is_alphanumeric() && c != '.' && c != '-')
        .filter(|s| s.len() >= 4 && !is_common_token(s))
        .max_by_key(|s| s.len())
        .unwrap_or("")
        .to_string()
}

fn extract_url_tokens(url: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut start = None;

    for (i, c) in url.char_indices() {
        if c.is_alphanumeric() || c == '.' || c == '-' {
            if start.is_none() {
                start = Some(i);
            }
        } else {
            if let Some(s) = start {
                let token = &url[s..i];
                if token.len() >= 4 {
                    tokens.push(token.to_string());
                }
                start = None;
            }
        }
    }
    if let Some(s) = start {
        let token = &url[s..];
        if token.len() >= 4 {
            tokens.push(token.to_string());
        }
    }

    tokens
}

fn is_common_token(token: &str) -> bool {
    matches!(
        token,
        "http" | "https" | "www" | "com" | "net" | "org" | "html" | "php"
    )
}

fn match_domain_anchor(url: &str, domain: &str) -> bool {
    // Find protocol end
    let after_proto = if let Some(pos) = url.find("://") {
        &url[pos + 3..]
    } else {
        url
    };

    // Get hostname part
    let host_end = after_proto.find('/').unwrap_or(after_proto.len());
    let host = &after_proto[..host_end];

    // Exact match or subdomain match
    host == domain || host.ends_with(&format!(".{}", domain))
}

/// Boyer-Moore-Horspool substring search.
/// ~3x faster than naive search for patterns > 4 bytes.
fn bmh_search(text: &[u8], pattern: &[u8]) -> bool {
    let n = text.len();
    let m = pattern.len();
    if m == 0 {
        return true;
    }
    if m > n {
        return false;
    }

    // Build bad character table
    let mut bad_char = [m; 256];
    for i in 0..m - 1 {
        bad_char[pattern[i] as usize] = m - 1 - i;
    }

    let mut i = m - 1;
    while i < n {
        let mut j = m - 1;
        let mut k = i;
        while pattern[j] == text[k] {
            if j == 0 {
                return true;
            }
            j -= 1;
            k -= 1;
        }
        i += bad_char[text[i] as usize];
    }
    false
}

fn match_wildcard(pattern: &str, text: &str) -> bool {
    let parts: Vec<&str> = pattern.split('*').filter(|s| !s.is_empty()).collect();
    let mut pos = 0;
    for part in parts {
        let clean = part.replace('^', "");
        if let Some(idx) = text[pos..].find(&clean) {
            pos += idx + clean.len();
        } else {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hostname_block() {
        let mut engine = WasmEngine::new();
        engine.add_hostname_block("ads.example.com");

        assert_eq!(
            engine.should_block(
                "https://ads.example.com/banner.js",
                "ads.example.com",
                "mysite.com",
                TYPE_SCRIPT,
            ),
            1
        );
    }

    #[test]
    fn test_hostname_allow() {
        let mut engine = WasmEngine::new();
        engine.add_hostname_block("example.com");
        engine.add_hostname_allow("cdn.example.com");

        assert_eq!(
            engine.should_block(
                "https://cdn.example.com/lib.js",
                "cdn.example.com",
                "mysite.com",
                TYPE_SCRIPT,
            ),
            0
        );
    }

    #[test]
    fn test_pattern_rule() {
        let mut engine = WasmEngine::new();
        engine.add_rule("||tracker.net^", false, 1, 0);

        assert_eq!(
            engine.should_block(
                "https://tracker.net/pixel.gif",
                "tracker.net",
                "other.com",
                TYPE_IMAGE,
            ),
            1
        );
    }

    #[test]
    fn test_no_match() {
        let mut engine = WasmEngine::new();
        engine.add_hostname_block("ads.com");

        assert_eq!(
            engine.should_block(
                "https://safe.org/page",
                "safe.org",
                "safe.org",
                TYPE_SCRIPT,
            ),
            2
        );
    }

    #[test]
    fn test_bmh_search() {
        assert!(bmh_search(b"hello world", b"world"));
        assert!(!bmh_search(b"hello world", b"xyz"));
        assert!(bmh_search(b"https://ads.doubleclick.net/pagead", b"doubleclick"));
    }

    #[test]
    fn test_third_party_filter() {
        let mut engine = WasmEngine::new();
        engine.add_rule("||tracker.com^", false, 1, 0); // third-party only

        // Third-party: should block
        assert_eq!(
            engine.should_block(
                "https://tracker.com/t.js",
                "tracker.com",
                "other.com",
                TYPE_SCRIPT,
            ),
            1
        );

        // First-party: should not block
        assert_eq!(
            engine.should_block(
                "https://tracker.com/t.js",
                "tracker.com",
                "tracker.com",
                TYPE_SCRIPT,
            ),
            2
        );
    }

    #[test]
    fn test_resource_type_filter() {
        let mut engine = WasmEngine::new();
        engine.add_rule("||ads.com^", false, -1, TYPE_SCRIPT); // script only

        // Script: should block
        assert_eq!(
            engine.should_block("https://ads.com/x.js", "ads.com", "other.com", TYPE_SCRIPT),
            1
        );

        // Image: should not block
        assert_eq!(
            engine.should_block("https://ads.com/x.png", "ads.com", "other.com", TYPE_IMAGE),
            2
        );
    }
}
