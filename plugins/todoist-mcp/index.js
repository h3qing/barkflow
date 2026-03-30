#!/usr/bin/env node

/**
 * @whisperwoof/todoist-mcp — MCP server for Todoist integration
 *
 * Creates tasks in Todoist from voice transcriptions.
 * Runs as an MCP server — WhisperWoof connects to it via stdio.
 *
 * Environment: TODOIST_API_KEY (required)
 *
 * Tools:
 *   - add_task: Create a new task in Todoist
 *   - list_projects: List Todoist projects
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TODOIST_API = "https://api.todoist.com/rest/v2";

function getApiKey() {
  const key = process.env.TODOIST_API_KEY;
  if (!key) {
    throw new Error("TODOIST_API_KEY environment variable is required");
  }
  return key;
}

async function todoistFetch(path, options = {}) {
  const key = getApiKey();
  const response = await fetch(`${TODOIST_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Todoist API error: ${response.status} ${body.slice(0, 200)}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// Create MCP server
const server = new McpServer({
  name: "whisperwoof-todoist",
  version: "0.1.0",
});

// Tool: add_task
server.tool(
  "add_task",
  "Create a new task in Todoist from voice transcription",
  {
    text: z.string().describe("The task content (from voice transcription)"),
    project: z.string().optional().describe("Project name to add the task to"),
    priority: z.number().min(1).max(4).optional().describe("Priority (1=normal, 4=urgent)"),
    due_string: z.string().optional().describe("Natural language due date (e.g., 'tomorrow', 'next Monday')"),
  },
  async ({ text, project, priority, due_string }) => {
    const body = {
      content: text,
      ...(priority ? { priority } : {}),
      ...(due_string ? { due_string } : {}),
    };

    // If project specified, find its ID
    if (project) {
      try {
        const projects = await todoistFetch("/projects");
        const match = projects.find(
          (p) => p.name.toLowerCase() === project.toLowerCase()
        );
        if (match) {
          body.project_id = match.id;
        }
      } catch {
        // Ignore project lookup failure — create in inbox
      }
    }

    const task = await todoistFetch("/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      content: [
        {
          type: "text",
          text: `Task created: "${task.content}"${task.url ? ` — ${task.url}` : ""}`,
        },
      ],
    };
  }
);

// Tool: list_projects
server.tool(
  "list_projects",
  "List all Todoist projects",
  {},
  async () => {
    const projects = await todoistFetch("/projects");
    const list = projects
      .map((p) => `• ${p.name} (${p.comment_count} comments)`)
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
