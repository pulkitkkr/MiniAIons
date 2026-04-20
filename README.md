# MiniAIons

A local web-based command center for managing multiple Claude CLI agent instances — create agents, chain them into workflows, install MCPs from a marketplace, and organize everything by project.

MiniAIons wraps the [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/overview) with a modern React UI so you can run many agent sessions in parallel, track cost and tokens in real time, and build reusable multi-step pipelines — all from `http://localhost:5173`.

---

## Quick Start

```bash
# One-click: install deps, start servers, open browser
./launch.sh

# Or manually
npm install
npm run dev          # server on :3001, client on :5173
```

Prerequisites:
- **Node.js 20+**
- **[Claude Code CLI](https://docs.claude.com/en/docs/claude-code/setup)** installed and authenticated (`claude --version` must work)

---

## Features

### Sessions
- Spawn as many parallel Claude sessions as you want — each runs in its own tab
- Full chat UI with markdown rendering, syntax-highlighted code blocks, tool-call cards, and collapsible extended-thinking blocks
- Real-time streaming via WebSocket
- Per-session live token count and cost (USD)
- Mention agents inline with `#agent-name` to scope a reply to that subagent

### Projects
- Every session belongs to a project (e.g., `Finance`, `Travel`, `Code Review`)
- Custom color per project and an optional project-wide system prompt applied to all sessions in it
- Drag-and-drop sessions between projects from the Projects page

### Agents
- Create custom subagents through a **collaborative builder chat** — you describe what you want, Claude helps refine the config, and the result is saved to `~/.claude/agents/<name>.md` (the same location the Claude CLI auto-discovers agents from)
- Each agent specifies: name, description, model, allowed tools, MCP servers, and the full system prompt
- Launch a dedicated session from any agent with one click
- Comes with 7 starter templates in `templates/agents/` (code-reviewer, debugger, architect, health-coach, research-assistant, shopping-advisor, and a blank template)

### Workflows
- Chain multiple agents/prompts into a **multi-step pipeline** where each step's output feeds the next
- Steps support variable interpolation: `{{input}}` (the workflow's initial input) and `{{step_N_output}}` (prior step outputs)
- Each step opens as an **interactive session** — you chat with it until satisfied, then advance by typing `[STEP_COMPLETE]` or clicking "Complete Step & Continue"
- 4 preset workflows included: Trip Planner, Smart Purchase Advisor, Budget Check-Up, and Wellness Plan
- Dedicated run view with a step-tracker sidebar and per-step cost aggregation

### MCP Marketplace
Browse and install Model Context Protocol servers across three tabs:

| Tab | Source | Setup |
|---|---|---|
| **Remote** | Official MCP registry (HTTP/SSE servers) | One-click, zero config |
| **Local** | NPM packages (run via `npx`) | One-click, zero config |
| **Custom** | Your own command + args | Manual, but flexible |

All installs go through the Claude CLI (`claude mcp add`) and are written to `~/.claude.json`.

### Dashboard
- Quick stats: total sessions, currently active, total cost
- Template quick-start panel
- New-session composer with project + agent + model selectors

### Settings
- Theme: Light, Dark, or System
- View installed CLI providers and their models
- Inspect raw `~/.claude/settings.json`

---

## Using Different Models

MiniAIons uses whatever models your CLI provider supports. By default that's the three Claude models.

### Switch models per session
On the Dashboard, pick a model from the dropdown before creating a session. Available models come from `config/providers.json`:

| Model | Use case | Cost (input / output per 1M) |
|---|---|---|
| `opus` | Hardest reasoning, long contexts | $15 / $75 |
| `sonnet` (default) | Balanced quality and speed | $3 / $15 |
| `haiku` | Fast, cheap, lightweight tasks | $0.25 / $1.25 |

### Per-agent model
Each agent pins its own model in its YAML frontmatter (`model: opus | sonnet | haiku`). When you launch a session from that agent, MiniAIons uses the pinned model.

### Per-step model in workflows
Each workflow step picks its own model too — use `haiku` for cheap summarization steps, `opus` for the final synthesis step.

---

## Configuration

### `config/providers.json` — CLI providers and models
Defines which CLI binaries can back a session and which models they expose. To add a new model, add an entry to the `models` array:

```json
{
  "claude": {
    "name": "Claude Code",
    "command": "claude",
    "args": ["-p", "--output-format", "stream-json", "--verbose"],
    "healthCheck": "claude --version",
    "models": [
      { "id": "opus",   "name": "Claude Opus 4",    "inputCostPer1M": 15,   "outputCostPer1M": 75 },
      { "id": "sonnet", "name": "Claude Sonnet 4",  "inputCostPer1M": 3,    "outputCostPer1M": 15 },
      { "id": "haiku",  "name": "Claude Haiku 3.5", "inputCostPer1M": 0.25, "outputCostPer1M": 1.25 }
    ],
    "defaultModel": "sonnet"
  }
}
```

To add a **new CLI provider** (e.g., GitHub Copilot CLI, Gemini CLI, a self-hosted wrapper), append a new top-level key with its `command`, `args`, `healthCheck`, and model list. The Dashboard's provider selector will pick it up automatically.

### `config/mcps-registry.json` — Curated MCP catalog
Static fallback list of MCPs shown in the marketplace's Custom tab. Add entries with `name`, `command`, `args`, `env`, and an optional `setup` block (with `instructions` and `fields`) for MCPs that need post-install config (API keys, tokens).

### `~/.claude/settings.json` — Claude CLI settings
MCP servers, user-level settings, and agent configs live here. MiniAIons **reads** this file but does not write to it directly — all mutations go through the Claude CLI (`claude mcp add`, `claude mcp remove`).

### `~/.claude/agents/*.md` — Agent definitions
Each agent is a markdown file with YAML frontmatter:

```markdown
---
name: code-reviewer
description: Reviews code for correctness, style, and security
model: sonnet
tools: Read, Glob, Grep, Bash
mcpServers: github
---

You are a senior code reviewer. When asked to review code:
1. Check for correctness and edge cases
2. Flag security issues
3. Suggest style improvements with examples
```

MiniAIons edits these from the Agent Builder — but you can also hand-edit them and they'll show up in the UI on refresh.

### `.npmrc` (optional)
If your shell `.npmrc` points at a private registry, add a project-local `.npmrc` forcing the public registry:

```
registry=https://registry.npmjs.org/
```

---

## Project Structure

```
MiniAIons/
├── server/                    # Express + WebSocket backend (port 3001)
│   ├── src/
│   │   ├── index.ts           # All REST routes + WS handler
│   │   ├── services/          # Session, MCP, agent, workflow, project services
│   │   └── types/index.ts
├── client/                    # React + Vite + Tailwind frontend (port 5173)
│   ├── src/
│   │   ├── pages/             # Dashboard, SessionView, Projects, McpManager, Agents, Workflows, WorkflowRunView, Settings
│   │   ├── components/        # Layout, WorkflowEditor, Settings panel
│   │   ├── stores/            # Zustand: session + UI state
│   │   └── lib/               # API client, WebSocket client, utils
├── config/
│   ├── providers.json         # CLI providers + models
│   └── mcps-registry.json     # Curated MCP catalog
├── templates/agents/          # Starter agent templates
├── data/                      # Runtime storage (gitignored): sessions, conversations, projects, workflow runs
└── launch.sh                  # One-click launcher
```

---

## How It Works

- **Session model**: each message spawns a fresh `claude -p --session-id <uuid>` (first turn) or `claude -p --resume <uuid>` (follow-ups) process. The CLI exits after each turn — MiniAIons tracks the session state and streams stdout to the browser over WebSocket.
- **Storage**: file-based, no database. Session metadata as JSON, conversations as append-only JSONL in `data/`.
- **MCP management**: every install/remove goes through the Claude CLI, so the registry stays authoritative in `~/.claude.json`.
- **Agents**: live in `~/.claude/agents/` — shared between MiniAIons and any direct `claude` CLI usage.

---

## Tech Stack

- **Backend**: Express 5, `ws`, `node-pty`, TypeScript
- **Frontend**: React 19, Vite 6, Tailwind CSS v4, Zustand, Radix UI, Framer Motion, `marked` + `highlight.js`
- **Runtime**: npm workspaces (server + client)

---

## Scripts

```bash
npm run dev      # Start server + client in dev mode
npm run build    # Production build (both workspaces)
npm run start    # Start built server
./launch.sh      # Install + start + open browser
```

---

## License

Personal project — no license specified. Use at your own risk.
