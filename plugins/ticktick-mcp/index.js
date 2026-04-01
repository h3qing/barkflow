#!/usr/bin/env node

/**
 * @whisperwoof/ticktick-mcp — MCP server for TickTick integration
 *
 * Creates tasks in TickTick from voice transcriptions.
 * Runs as an MCP server — WhisperWoof connects to it via stdio.
 *
 * Environment: TICKTICK_ACCESS_TOKEN (required)
 *
 * Setup:
 *   1. Go to https://developer.ticktick.com/manage
 *   2. Create an app → get Client ID and Client Secret
 *   3. Use OAuth2 to get an access token (see README)
 *   4. Set TICKTICK_ACCESS_TOKEN in your environment
 *
 * Tools:
 *   - add_task: Create a new task in TickTick
 *   - list_projects: List TickTick projects (lists)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TICKTICK_API = "https://api.ticktick.com/open/v1";

function getAccessToken() {
  const token = process.env.TICKTICK_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "TICKTICK_ACCESS_TOKEN environment variable is required.\n" +
      "Get one at https://developer.ticktick.com/manage"
    );
  }
  return token;
}

async function ticktickFetch(path, options = {}) {
  const token = getAccessToken();
  const response = await fetch(`${TICKTICK_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TickTick API error: ${response.status} ${body.slice(0, 200)}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// Create MCP server
const server = new McpServer({
  name: "whisperwoof-ticktick",
  version: "0.1.0",
});

// Tool: add_task
server.tool(
  "add_task",
  "Create a new task in TickTick from voice transcription",
  {
    title: z.string().describe("The task title (from voice transcription)"),
    content: z.string().optional().describe("Additional task description or notes"),
    projectId: z.string().optional().describe("Project/list ID to add the task to (use list_projects to find IDs)"),
    priority: z.number().min(0).max(5).optional().describe("Priority (0=none, 1=low, 3=medium, 5=high)"),
    dueDate: z.string().optional().describe("Due date in ISO 8601 format (e.g., '2026-04-01T09:00:00+0000')"),
  },
  async ({ title, content, projectId, priority, dueDate }) => {
    const body = {
      title,
      ...(content ? { content } : {}),
      ...(projectId ? { projectId } : {}),
      ...(priority != null ? { priority } : {}),
      ...(dueDate ? { dueDate } : {}),
    };

    const task = await ticktickFetch("/task", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      content: [
        {
          type: "text",
          text: `Task created: "${task.title}"${task.projectId ? ` in project ${task.projectId}` : ""}`,
        },
      ],
    };
  }
);

// Tool: list_projects
server.tool(
  "list_projects",
  "List all TickTick projects (lists)",
  {},
  async () => {
    const projects = await ticktickFetch("/project");
    const list = projects
      .map((p) => `• ${p.name} (ID: ${p.id})`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: list || "No projects found",
        },
      ],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
