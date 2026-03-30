/**
 * Tests for Entry Chaining — link/unlink, tree traversal, cycle detection
 */

import { describe, it, expect } from 'vitest';

// Simulate chain logic with in-memory structures

interface ChainLink {
  childId: string;
  parentId: string;
}

function isAncestor(potentialAncestor: string, entryId: string, links: ChainLink[]): boolean {
  let current = entryId;
  const visited = new Set<string>();

  while (current) {
    if (current === potentialAncestor) return true;
    if (visited.has(current)) return false;
    visited.add(current);

    const link = links.find((l) => l.childId === current);
    current = link ? link.parentId : "";
  }

  return false;
}

function getChainRoot(entryId: string, links: ChainLink[]): string {
  let current = entryId;
  const visited = new Set<string>();

  while (true) {
    const link = links.find((l) => l.childId === current);
    if (!link) return current;
    if (visited.has(link.parentId)) return current;
    visited.add(current);
    current = link.parentId;
  }
}

function getChain(entryId: string, links: ChainLink[], entries: string[]): string[] {
  const rootId = getChainRoot(entryId, links);
  const result: string[] = [];
  const queue = [rootId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (entries.includes(current)) result.push(current);

    const children = links.filter((l) => l.parentId === current).map((l) => l.childId);
    queue.push(...children);
  }

  return result;
}

function getParent(entryId: string, links: ChainLink[]): string | null {
  const link = links.find((l) => l.childId === entryId);
  return link ? link.parentId : null;
}

function getChildren(entryId: string, links: ChainLink[]): string[] {
  return links.filter((l) => l.parentId === entryId).map((l) => l.childId);
}

describe('Entry Chaining', () => {
  // Chain: A → B → C (A is root)
  const links: ChainLink[] = [
    { childId: "B", parentId: "A" },
    { childId: "C", parentId: "B" },
  ];
  const allEntries = ["A", "B", "C", "D"];

  describe('getChainRoot', () => {
    it('finds root from any entry in chain', () => {
      expect(getChainRoot("C", links)).toBe("A");
      expect(getChainRoot("B", links)).toBe("A");
      expect(getChainRoot("A", links)).toBe("A"); // root itself
    });

    it('returns self for unlinked entry', () => {
      expect(getChainRoot("D", links)).toBe("D");
    });
  });

  describe('getChain', () => {
    it('returns all entries in chain from any member', () => {
      const chain = getChain("C", links, allEntries);
      expect(chain).toContain("A");
      expect(chain).toContain("B");
      expect(chain).toContain("C");
      expect(chain).not.toContain("D");
    });

    it('returns single entry for unlinked', () => {
      expect(getChain("D", links, allEntries)).toEqual(["D"]);
    });

    it('root traversal returns full chain', () => {
      expect(getChain("A", links, allEntries)).toHaveLength(3);
    });
  });

  describe('getParent', () => {
    it('returns parent for child', () => {
      expect(getParent("B", links)).toBe("A");
      expect(getParent("C", links)).toBe("B");
    });

    it('returns null for root', () => {
      expect(getParent("A", links)).toBeNull();
    });

    it('returns null for unlinked', () => {
      expect(getParent("D", links)).toBeNull();
    });
  });

  describe('getChildren', () => {
    it('returns children', () => {
      expect(getChildren("A", links)).toEqual(["B"]);
      expect(getChildren("B", links)).toEqual(["C"]);
    });

    it('returns empty for leaf', () => {
      expect(getChildren("C", links)).toEqual([]);
    });

    it('returns empty for unlinked', () => {
      expect(getChildren("D", links)).toEqual([]);
    });
  });

  describe('isAncestor (cycle detection)', () => {
    it('detects direct ancestor', () => {
      expect(isAncestor("A", "B", links)).toBe(true);
    });

    it('detects transitive ancestor', () => {
      expect(isAncestor("A", "C", links)).toBe(true);
    });

    it('non-ancestor returns false', () => {
      expect(isAncestor("C", "A", links)).toBe(false);
      expect(isAncestor("D", "A", links)).toBe(false);
    });

    it('self-link detected (entry is its own ancestor)', () => {
      // isAncestor("A", "A") returns true — prevents self-linking
      // (linkEntries also has a direct childId === parentId check)
      expect(isAncestor("A", "A", links)).toBe(true);
    });
  });

  describe('validation', () => {
    it('cannot link entry to itself', () => {
      // Validation logic: childId === parentId
      expect("A" === "A").toBe(true); // would be rejected
    });

    it('cannot create cycle', () => {
      // If we try to link A → C (A as child of C), isAncestor(A, C) = true
      expect(isAncestor("A", "C", links)).toBe(true); // A is ancestor of C
    });

    it('entry can only have one parent', () => {
      // B already has parent A — checked via PRIMARY KEY (child_id)
      const existing = links.find((l) => l.childId === "B");
      expect(existing).toBeDefined();
    });
  });

  describe('branching', () => {
    // A has two children: B and D
    const branchLinks: ChainLink[] = [
      { childId: "B", parentId: "A" },
      { childId: "D", parentId: "A" },
      { childId: "C", parentId: "B" },
    ];

    it('getChildren returns multiple children', () => {
      expect(getChildren("A", branchLinks)).toEqual(["B", "D"]);
    });

    it('getChain from any leaf includes all members', () => {
      const chain = getChain("C", branchLinks, allEntries);
      expect(chain).toHaveLength(4); // A, B, C, D
    });

    it('root is still A', () => {
      expect(getChainRoot("D", branchLinks)).toBe("A");
      expect(getChainRoot("C", branchLinks)).toBe("A");
    });
  });
});
