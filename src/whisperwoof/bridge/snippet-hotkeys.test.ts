/**
 * Tests for snippet hotkey paste logic
 *
 * Tests the lookup and usage recording logic without Electron dependencies.
 */

import { describe, it, expect, beforeEach } from 'vitest';

interface SnippetRow {
  id: string;
  content: string;
  title: string;
  board_id: string;
  hotkey: string | null;
  use_count: number;
  last_used_at: string | null;
}

// In-memory mock of the DB lookup logic from snippet-hotkeys.js
function getSnippetByHotkey(snippets: SnippetRow[], hotkeyNumber: number) {
  const row = snippets.find((s) => s.hotkey === String(hotkeyNumber));
  if (!row) return null;
  return {
    id: row.id,
    content: row.content,
    title: row.title,
    boardId: row.board_id,
    hotkey: row.hotkey,
    useCount: row.use_count ?? 0,
  };
}

function recordUse(snippets: SnippetRow[], snippetId: string): SnippetRow[] {
  return snippets.map((s) =>
    s.id === snippetId
      ? { ...s, use_count: s.use_count + 1, last_used_at: new Date().toISOString() }
      : s
  );
}

describe('Snippet Hotkey Paste', () => {
  let snippets: SnippetRow[];

  beforeEach(() => {
    snippets = [
      { id: 's1', content: 'Thanks for your email!', title: 'Thank you', board_id: 'b1', hotkey: '1', use_count: 5, last_used_at: null },
      { id: 's2', content: 'Best regards, Heqing', title: 'Sign off', board_id: 'b1', hotkey: '2', use_count: 3, last_used_at: null },
      { id: 's3', content: 'console.log(data);', title: 'Debug log', board_id: 'b2', hotkey: null, use_count: 0, last_used_at: null },
      { id: 's4', content: 'LGTM!', title: 'Approve', board_id: 'b2', hotkey: '9', use_count: 12, last_used_at: null },
    ];
  });

  it('looks up snippet by hotkey number', () => {
    const result = getSnippetByHotkey(snippets, 1);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Thanks for your email!');
    expect(result!.title).toBe('Thank you');
    expect(result!.hotkey).toBe('1');
  });

  it('returns null for unassigned hotkey', () => {
    expect(getSnippetByHotkey(snippets, 3)).toBeNull();
    expect(getSnippetByHotkey(snippets, 5)).toBeNull();
  });

  it('returns null for hotkey 0 (not valid range)', () => {
    expect(getSnippetByHotkey(snippets, 0)).toBeNull();
  });

  it('finds snippet with hotkey 9', () => {
    const result = getSnippetByHotkey(snippets, 9);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('LGTM!');
  });

  it('skips snippets without hotkey assignment', () => {
    // s3 has hotkey: null — should never match
    for (let i = 1; i <= 9; i++) {
      const result = getSnippetByHotkey(snippets, i);
      if (result) {
        expect(result.id).not.toBe('s3');
      }
    }
  });

  it('records usage and increments count', () => {
    const updated = recordUse(snippets, 's1');
    const s1 = updated.find((s) => s.id === 's1')!;
    expect(s1.use_count).toBe(6);
    expect(s1.last_used_at).not.toBeNull();
  });

  it('does not affect other snippets when recording use', () => {
    const updated = recordUse(snippets, 's1');
    const s2 = updated.find((s) => s.id === 's2')!;
    expect(s2.use_count).toBe(3); // unchanged
    expect(s2.last_used_at).toBeNull(); // unchanged
  });

  it('records multiple uses', () => {
    let current = snippets;
    current = recordUse(current, 's4');
    current = recordUse(current, 's4');
    current = recordUse(current, 's4');
    const s4 = current.find((s) => s.id === 's4')!;
    expect(s4.use_count).toBe(15); // 12 + 3
  });

  it('maps all 9 hotkeys correctly', () => {
    const allHotkeys = [
      { id: 'h1', content: 'One', title: '1', board_id: 'b', hotkey: '1', use_count: 0, last_used_at: null },
      { id: 'h2', content: 'Two', title: '2', board_id: 'b', hotkey: '2', use_count: 0, last_used_at: null },
      { id: 'h3', content: 'Three', title: '3', board_id: 'b', hotkey: '3', use_count: 0, last_used_at: null },
      { id: 'h4', content: 'Four', title: '4', board_id: 'b', hotkey: '4', use_count: 0, last_used_at: null },
      { id: 'h5', content: 'Five', title: '5', board_id: 'b', hotkey: '5', use_count: 0, last_used_at: null },
      { id: 'h6', content: 'Six', title: '6', board_id: 'b', hotkey: '6', use_count: 0, last_used_at: null },
      { id: 'h7', content: 'Seven', title: '7', board_id: 'b', hotkey: '7', use_count: 0, last_used_at: null },
      { id: 'h8', content: 'Eight', title: '8', board_id: 'b', hotkey: '8', use_count: 0, last_used_at: null },
      { id: 'h9', content: 'Nine', title: '9', board_id: 'b', hotkey: '9', use_count: 0, last_used_at: null },
    ];

    for (let i = 1; i <= 9; i++) {
      const result = getSnippetByHotkey(allHotkeys, i);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(`h${i}`);
    }
  });
});
