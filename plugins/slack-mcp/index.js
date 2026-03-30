#!/usr/bin/env node

/**
 * @whisperwoof/slack-mcp — MCP server for Slack integration
 *
 * Sends voice transcriptions to Slack channels.
 * Environment: SLACK_BOT_TOKEN (required)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SLACK_API = "https://slack.com/api";

function getToken() {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN environment variable is required");
  return token;
}

async function slackPost(method, body) {
  const response = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
  return data;
}

const server = new McpServer({
  name: "whisperwoof-slack",
  version: "0.1.0",
});

server.tool(
  "send_message",
  "Send a voice transcription to a Slack channel",
  {
    text: z.string().describe("The message text"),
    channel: z.string().describe("Channel name (without #) or channel ID"),
  },
  async ({ text, channel }) => {
    // If channel is a name, try to find its ID
    let channelId = channel;
    if (!channel.startsWith("C") && !channel.startsWith("D")) {
      try {
        const list = await slackPost("conversations.list", { types: "public_channel,private_channel", limit: 200 });
        const match = list.channels?.find((c) => c.name === channel.replace(/^#/, ""));
        if (match) channelId = match.id;
      } catch {
        // Use as-is
      }
    }

    const result = await slackPost("chat.postMessage", {
      channel: channelId,
      text,
    });

    return {
      content: [{ type: "text", text: `Message sent to #${channel}: "${text.slice(0, 50)}..."` }],
    };
  }
);

server.tool(
  "list_channels",
  "List available Slack channels",
  {},
  async () => {
    const result = await slackPost("conversations.list", { types: "public_channel", limit: 50 });
    const channels = (result.channels || [])
      .map((c) => `• #${c.name}${c.purpose?.value ? ` — ${c.purpose.value.slice(0, 60)}` : ""}`)
      .join("\n");
    return {
      content: [{ type: "text", text: channels || "No channels found" }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
