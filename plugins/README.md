# WhisperWoof MCP Plugins

First-party MCP server plugins for WhisperWoof. Each plugin is an MCP server that WhisperWoof connects to via stdio.

## Available Plugins

| Plugin | What it does | API Key |
|--------|-------------|---------|
| `todoist-mcp` | Create tasks in Todoist | `TODOIST_API_KEY` |
| `notion-mcp` | Save notes to Notion pages | `NOTION_API_KEY` |
| `slack-mcp` | Send messages to Slack | `SLACK_BOT_TOKEN` |

## Usage

1. Set the API key as an environment variable
2. Enable the plugin in WhisperWoof Settings → Plugins
3. Use Command Bar (Cmd+K) with `/todo`, `/note`, or `/slack` prefix

## Development

Each plugin is a standalone Node.js MCP server using `@modelcontextprotocol/sdk`.

```bash
cd plugins/todoist-mcp
npm install
TODOIST_API_KEY=your-key node index.js
```

## Creating a Custom Plugin

Any MCP server works as a WhisperWoof plugin. See the [MCP documentation](https://modelcontextprotocol.io) for how to build one.
