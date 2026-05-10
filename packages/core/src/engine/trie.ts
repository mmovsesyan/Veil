/**
 * Aho-Corasick-inspired Trie for fast multi-pattern matching.
 * Used by BlockingEngine for O(n) URL matching where n = URL length,
 * regardless of the number of rules.
 */

interface TrieNode {
  children: Map<number, TrieNode>; // char code → child
  ruleIds: number[]; // rules that end at this node
  fail?: TrieNode; // failure link for Aho-Corasick
}

export class PatternTrie {
  private root: TrieNode = { children: new Map(), ruleIds: [] };
  private built = false;

  /**
   * Insert a pattern into the trie.
   * Patterns are domain fragments extracted from rules.
   */
  insert(pattern: string, ruleId: number): void {
    this.built = false;
    let node = this.root;

    for (let i = 0; i < pattern.length; i++) {
      const code = pattern.charCodeAt(i);
      let child = node.children.get(code);
      if (!child) {
        child = { children: new Map(), ruleIds: [] };
        node.children.set(code, child);
      }
      node = child;
    }

    node.ruleIds.push(ruleId);
  }

  /**
   * Build failure links (Aho-Corasick automaton).
   * Must be called after all patterns are inserted.
   */
  build(): void {
    if (this.built) return;

    const queue: TrieNode[] = [];

    // Initialize depth-1 nodes with fail → root
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    // BFS to build failure links
    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const [code, child] of current.children) {
        queue.push(child);

        let fail = current.fail;
        while (fail && !fail.children.has(code)) {
          fail = fail.fail;
        }

        child.fail = fail ? fail.children.get(code)! : this.root;

        // Merge output from failure chain
        if (child.fail.ruleIds.length > 0) {
          child.ruleIds = [...child.ruleIds, ...child.fail.ruleIds];
        }
      }
    }

    this.built = true;
  }

  /**
   * Search text for all matching patterns.
   * Returns array of matched rule IDs.
   * Time complexity: O(text.length + matches)
   */
  search(text: string): number[] {
    if (!this.built) this.build();

    const matches: number[] = [];
    let node = this.root;

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);

      while (node !== this.root && !node.children.has(code)) {
        node = node.fail ?? this.root;
      }

      node = node.children.get(code) ?? this.root;

      if (node.ruleIds.length > 0) {
        for (const id of node.ruleIds) {
          matches.push(id);
        }
      }
    }

    return matches;
  }

  /**
   * Get number of patterns in the trie.
   */
  get size(): number {
    let count = 0;
    const stack: TrieNode[] = [this.root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      count += node.ruleIds.length;
      for (const child of node.children.values()) {
        stack.push(child);
      }
    }
    return count;
  }
}
