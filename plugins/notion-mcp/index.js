#!/usr/bin/env node

/**
 * @whisperwoof/notion-mcp — MCP server for Notion integration
 *
 * Saves voice transcriptions as Notion pages.
 * Runs as an MCP server — WhisperWoof connects via stdio.
 *
 * Environment: NOTION_API_KEY (required), NOTION_DATABASE_ID (optional)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function getApiKey() {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error("NOTION_API_KEY environment variable is required");
  return key;
}

async function notionFetch(path, options = {}) {
  const key = getApiKey();
  const response = await fetch(`${NOTION_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Notion API error: ${response.status} ${body.slice(0, 200)}`);
  }
  return response.json();
}

const server = new McpServer({
  name: "whisperwoof-notion",
  version: "0.1.0",
});

// Tool: create_page
server.tool(
  "create_page",
  "Save voice transcription as a new Notion page",
  {
    text: z.string().describe("The transcription text to save"),
    title: z.string().optional().describe("Page title (auto-generated from first line if not provided)"),
  },
  async ({ text, title }) => {
    const pageTitle = title || text.split(/[.\n]/)[0].slice(0, 60) || "Voice Note";
    const databaseId = process.env.NOTION_DATABASE_ID;

    const body = databaseId
      ? {
          parent: { database_id: databaseId },
          properties: {
            Name: { title: [{ text: { content: pageTitle } }] },
          },
          children: [
            { object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: text } }] } },
          ],
        }
      : {
          parent: { page_id: process.env.NOTION_PAGE_ID || "" },
          properties: {
            title: { title: [{ text: { content: pageTitle } }] },
          },
          children: [
            { object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: text } }] } },
          ],
        };

    const page = await notionFetch("/pages", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      content: [{ type: "text", text: `Saved to Notion: "${pageTitle}" — ${page.url}` }],
    };
  }
);

// Tool: search
server.tool(
  "search",
  "Search Notion for pages matching a query",
  { query: z.string().describe("Search query") },
  async ({ query }) => {
    const result = await notionFetch("/search", {
      method: "POST",
      body: JSON.stringify({ query, page_size: 5 }),
    });
    const pages = result.results
      .filter((r) => r.object === "page")
      .map((p) => {
        const title = p.properties?.Name?.title?.[0]?.text?.content
          || p.properties?.title?.title?.[0]?.text?.content
          || "Untitled";
        return `• ${title} — ${p.url}`;
      });
    return {
      content: [{ type: "text", text: pages.length ? pages.join("\n") : "No results found" }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
