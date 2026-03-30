/**
 * Tests for Agentic Actions — intent detection and action routing
 */

import { describe, it, expect } from 'vitest';

interface ActionPattern {
  id: string;
  plugin: string;
  patterns: RegExp[];
  tool: string;
  label: string;
}

const ACTION_PATTERNS: ActionPattern[] = [
  { id: "calendar", plugin: "calendar", patterns: [/\b(schedule|book|set up|create)\s+(an?\s+)?(meeting|call|event|appointment)\b/i, /\b(add|put)\s+(.*?)\s+(on|to)\s+(my\s+)?(calendar|schedule)\b/i], tool: "create_event", label: "Create calendar event" },
  { id: "slack", plugin: "slack", patterns: [/\b(send|post)\s+(an?\s+)?(slack\s+message|message)\s+(to|in)\b/i, /\b(message|dm|ping)\s+(the team|channel|#\w+|\w+)\s+(on\s+)?slack\b/i], tool: "send_message", label: "Send Slack message" },
  { id: "todoist", plugin: "todoist", patterns: [/\b(add|create)\s+(a\s+)?(task|todo|to-do|reminder)\b/i, /\b(remind me to|don't forget to|need to)\b/i], tool: "add_task", label: "Add task" },
  { id: "notion", plugin: "notion", patterns: [/\b(create|make|add)\s+(a\s+)?(notion|page|doc|document|note)\s*(in\s+notion)?\b/i, /\b(save|write)\s+(this|that|it)\s+(to|in)\s+notion\b/i], tool: "create_page", label: "Create Notion page" },
  { id: "email", plugin: "email", patterns: [/\b(send|write|draft)\s+(an?\s+)?email\s+(to)\b/i], tool: "send_email", label: "Send email" },
];

function detectActionIntent(text: string | null): { id: string; plugin: string; tool: string } | null {
  if (!text || text.length < 8) return null;
  for (const action of ACTION_PATTERNS) {
    for (const pattern of action.patterns) {
      if (pattern.test(text.trim())) {
        return { id: action.id, plugin: action.plugin, tool: action.tool };
      }
    }
  }
  return null;
}

describe('Agentic Actions', () => {
  describe('calendar intent', () => {
    it('detects meeting scheduling', () => {
      expect(detectActionIntent("Schedule a meeting with Sarah for Friday")?.id).toBe("calendar");
      expect(detectActionIntent("Book a call with the team at 3pm")?.id).toBe("calendar");
      expect(detectActionIntent("Set up an appointment with the dentist")?.id).toBe("calendar");
      expect(detectActionIntent("Create an event for the launch party")?.id).toBe("calendar");
    });

    it('detects calendar additions', () => {
      expect(detectActionIntent("Add the demo to my calendar")?.id).toBe("calendar");
      expect(detectActionIntent("Put the standup on my schedule")?.id).toBe("calendar");
    });

    it('routes to calendar plugin', () => {
      const action = detectActionIntent("Schedule a meeting with Sarah");
      expect(action?.plugin).toBe("calendar");
      expect(action?.tool).toBe("create_event");
    });
  });

  describe('slack intent', () => {
    it('detects Slack messages', () => {
      expect(detectActionIntent("Send a Slack message to the engineering channel")?.id).toBe("slack");
      expect(detectActionIntent("Post a message in the general channel")?.id).toBe("slack");
      expect(detectActionIntent("Message the team on Slack")?.id).toBe("slack");
    });

    it('routes to slack plugin', () => {
      expect(detectActionIntent("Send a Slack message to the team")?.plugin).toBe("slack");
    });
  });

  describe('todoist intent', () => {
    it('detects task creation', () => {
      expect(detectActionIntent("Add a task to buy groceries")?.id).toBe("todoist");
      expect(detectActionIntent("Create a reminder to call Sarah")?.id).toBe("todoist");
      expect(detectActionIntent("Remind me to submit the report")?.id).toBe("todoist");
    });

    it('detects "need to" as task intent', () => {
      expect(detectActionIntent("I need to finish the presentation by Friday")?.id).toBe("todoist");
    });
  });

  describe('notion intent', () => {
    it('detects Notion page creation', () => {
      expect(detectActionIntent("Create a Notion page with today's notes")?.id).toBe("notion");
      expect(detectActionIntent("Save this to Notion")?.id).toBe("notion");
      expect(detectActionIntent("Make a document for the project")?.id).toBe("notion");
    });
  });

  describe('email intent', () => {
    it('detects email sending', () => {
      expect(detectActionIntent("Send an email to John about the project")?.id).toBe("email");
      expect(detectActionIntent("Write an email to the client")?.id).toBe("email");
      expect(detectActionIntent("Draft an email to Sarah")?.id).toBe("email");
    });
  });

  describe('non-action text', () => {
    it('returns null for normal speech', () => {
      expect(detectActionIntent("The weather is nice today")).toBeNull();
      expect(detectActionIntent("I was thinking about the project")).toBeNull();
      expect(detectActionIntent("Let me explain the architecture")).toBeNull();
    });

    it('returns null for short/null input', () => {
      expect(detectActionIntent("")).toBeNull();
      expect(detectActionIntent(null)).toBeNull();
      expect(detectActionIntent("hello")).toBeNull();
    });
  });

  describe('action registry', () => {
    it('has 5 action types', () => {
      expect(ACTION_PATTERNS).toHaveLength(5);
    });

    it('all have unique IDs', () => {
      const ids = ACTION_PATTERNS.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('each action maps to a plugin', () => {
      for (const action of ACTION_PATTERNS) {
        expect(action.plugin).toBeTruthy();
        expect(action.tool).toBeTruthy();
      }
    });
  });
});
