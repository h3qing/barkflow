/**
 * Tests for Smart Reply — reply detection and mode mapping
 */

import { describe, it, expect } from 'vitest';

const REPLY_SIGNALS = [
  /\b(reply|respond|answer|write back|get back to)\b/i,
  /\b(tell (them|him|her|the team)|let (them|him|her) know)\b/i,
  /\b(say (that|yes|no|thanks)|sounds good|that works|I agree|I disagree)\b/i,
  /\b(email|message|slack|dm|text)\s+(them|him|her|back)\b/i,
  /\b(re:|regarding|about their|in response to)\b/i,
];

function isReplyIntent(text: string | null): boolean {
  if (!text || text.length < 5) return false;
  return REPLY_SIGNALS.some((p) => p.test(text));
}

const APP_REPLY_MODE: Record<string, string> = {
  "com.apple.mail": "email",
  "com.microsoft.Outlook": "email",
  "com.tinyspeck.slackmacgap": "slack",
  "com.hnc.Discord": "slack",
  "com.microsoft.teams2": "slack",
  "com.microsoft.VSCode": "comment",
  "com.apple.dt.Xcode": "comment",
};

function getReplyMode(bundleId: string | null): string {
  return (bundleId && APP_REPLY_MODE[bundleId]) || "general";
}

describe('Smart Reply', () => {
  describe('isReplyIntent', () => {
    it('detects "reply" keywords', () => {
      expect(isReplyIntent("Reply to Sarah about the meeting")).toBe(true);
      expect(isReplyIntent("I need to respond to the email")).toBe(true);
      expect(isReplyIntent("Write back to the client")).toBe(true);
    });

    it('detects "tell them" patterns', () => {
      expect(isReplyIntent("Tell them we agree with the proposal")).toBe(true);
      expect(isReplyIntent("Let him know the meeting is moved")).toBe(true);
      expect(isReplyIntent("Tell the team we're on track")).toBe(true);
    });

    it('detects casual reply patterns', () => {
      expect(isReplyIntent("Say yes to the dinner invite")).toBe(true);
      expect(isReplyIntent("That works for me, sounds good")).toBe(true);
      expect(isReplyIntent("I agree with their approach")).toBe(true);
    });

    it('detects message-back patterns', () => {
      expect(isReplyIntent("Email them back with the updated timeline")).toBe(true);
      expect(isReplyIntent("Slack him the meeting notes")).toBe(true);
      expect(isReplyIntent("DM her the link")).toBe(true);
    });

    it('detects "regarding" patterns', () => {
      expect(isReplyIntent("Regarding their proposal, we should accept")).toBe(true);
      expect(isReplyIntent("In response to the budget question")).toBe(true);
    });

    it('returns false for non-reply text', () => {
      expect(isReplyIntent("I need to buy groceries")).toBe(false);
      expect(isReplyIntent("Schedule a meeting for Friday")).toBe(false);
      expect(isReplyIntent("Create a new function for the API")).toBe(false);
    });

    it('returns false for short/null input', () => {
      expect(isReplyIntent("")).toBe(false);
      expect(isReplyIntent(null)).toBe(false);
      expect(isReplyIntent("hi")).toBe(false);
    });
  });

  describe('getReplyMode', () => {
    it('maps email apps to email mode', () => {
      expect(getReplyMode("com.apple.mail")).toBe("email");
      expect(getReplyMode("com.microsoft.Outlook")).toBe("email");
    });

    it('maps chat apps to slack mode', () => {
      expect(getReplyMode("com.tinyspeck.slackmacgap")).toBe("slack");
      expect(getReplyMode("com.hnc.Discord")).toBe("slack");
      expect(getReplyMode("com.microsoft.teams2")).toBe("slack");
    });

    it('maps IDEs to comment mode', () => {
      expect(getReplyMode("com.microsoft.VSCode")).toBe("comment");
      expect(getReplyMode("com.apple.dt.Xcode")).toBe("comment");
    });

    it('defaults to general for unknown apps', () => {
      expect(getReplyMode("com.unknown.app")).toBe("general");
      expect(getReplyMode(null)).toBe("general");
    });
  });

  describe('reply modes', () => {
    const modes = ["email", "slack", "comment", "general"];

    it('has 4 reply modes', () => {
      expect(modes).toHaveLength(4);
    });
  });
});
