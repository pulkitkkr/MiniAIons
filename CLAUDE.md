# MyAgents

Local web-based command center for managing multiple Claude CLI agent instances with a modern GUI.

## Quick Start
```
./launch.sh          # One-click: install deps + start + open browser
npm run dev           # Start server (3001) + client (5173)
npm run build         # Production build
```

## Project Structure
```
MyAgents/
├── server/                         # Express + WebSocket backend
│   ├── src/
│   │   ├── index.ts                # Entry: Express app + all REST routes + WS handler
│   │   ├── services/
│   │   │   ├── session-manager.ts  # Core: spawn/track/kill Claude CLI processes
│   │   │   ├── mcp-manager.ts      # Read/write MCP configs in ~/.claude/settings.json
│   │   │   └── project-service.ts  # CRUD for projects (file-based)
│   │   └── types/index.ts          # All TypeScript interfaces
│   ├── package.json                # deps: express, ws, node-pty, cors, uuid
│   └── tsconfig.json
│
├── client/                         # React + Vite + Tailwind frontend
│   ├── src/
│   │   ├── App.tsx                 # Router: Dashboard, Session, Projects, MCPs, Agents, Workflows, Settings
│   │   ├── main.tsx                # React entry
│   │   ├── globals.css             # Tailwind base + Inter font + scrollbar + hljs
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # Session creation (with project selector), stats, template quick-start
│   │   │   ├── SessionView.tsx     # Chat UI, tool call cards, thinking blocks, markdown rendering
│   │   │   ├── Projects.tsx        # Project CRUD, drag-drop session assignment
│   │   │   ├── McpManager.tsx      # Installed servers + marketplace with category filters
│   │   │   ├── Agents.tsx          # Agent CRUD (list + collaborative builder chat), launch sessions from agents
│   │   │   ├── Workflows.tsx       # Workflow list + CRUD (persisted to data/workflows/)
│   │   │   ├── WorkflowRunView.tsx # Dedicated run page with step tracker sidebar + full output panels
│   │   ├── components/
│   │   │   ├── WorkflowEditor.tsx  # Create/edit workflow with step builder
│   │   │   └── Settings.tsx        # Theme toggle, provider config, Claude settings viewer
│   │   ├── components/layout/
│   │   │   ├── MainLayout.tsx      # Shell: sidebar + header + outlet
│   │   │   ├── Sidebar.tsx         # Nav, active session tabs with status dots
│   │   │   └── Header.tsx          # Token count, cost badge, theme toggle
│   │   ├── stores/
│   │   │   ├── session-store.ts    # Zustand: sessions, tabs, stream event parsing
│   │   │   └── ui-store.ts         # Zustand: theme (light/dark/system), sidebar
│   │   └── lib/
│   │       ├── api.ts              # REST client (fetch wrapper for all /api/* endpoints)
│   │       ├── ws.ts               # WebSocket client singleton with auto-reconnect
│   │       └── utils.ts            # cn(), formatCost(), formatTokens(), timeAgo()
│   ├── index.html
│   ├── vite.config.ts              # Proxy /api + /ws to localhost:3001
│   ├── package.json                # deps: react, zustand, lucide-react, marked, highlight.js, framer-motion, radix-ui
│   └── tsconfig.json
│
├── config/
│   ├── providers.json              # CLI provider definitions (claude + models). Add copilot here for future support
│   └── mcps-registry.json          # Curated MCP catalog (static fallback with setup metadata)
│
├── templates/agents/               # Legacy agent templates (migrated to ~/.claude/agents/)
│   ├── _template.md                # Meta-template showing format
│   ├── code-reviewer.md
│   ├── debugger.md
│   └── architect.md
│
├── data/                           # Runtime storage (gitignored)
│   ├── sessions/{uuid}.json        # Session metadata
│   ├── conversations/{uuid}.jsonl  # Conversation logs (append-only)
│   └── projects/{uuid}.json        # Project data
│
├── launch.sh                       # One-click launcher (chmod +x)
├── package.json                    # npm workspaces root (server + client)
├── .npmrc                          # Forces public npm registry (gitignored)
└── .gitignore
```

## Architecture

### Backend (server/src/index.ts)
- **Express v5** serves REST API on port 3001
- **WebSocket** on `/ws` for real-time session streaming
- **SessionManager** spawns a NEW `claude -p` process per message (CLI exits after each turn)
  - First message: `claude -p --session-id <uuid> "prompt"`
  - Follow-ups: `claude -p --resume <uuid> "prompt"`
  - DO NOT use `--input-format stream-json` — it doesn't work for multi-turn
- Each session = metadata + event buffer + WS subscribers (process is transient, not persistent)
- Sessions persist to `data/sessions/`, conversations append to `data/conversations/`
- **McpManager** uses Claude CLI commands to register MCPs in `~/.claude.json`:
  - Stdio: `claude mcp add-json -s user <name> '<json>'`
  - Remote: `claude mcp add --transport http|sse -s user <name> <url>`
  - Remove: `claude mcp remove -s user <name>`
- **McpRegistryService** fetches 1000+ servers from official MCP registry (`registry.modelcontextprotocol.io/v0.1/servers`), caches in memory, filters to zero-config only
- **ProjectService** manages project files in `data/projects/`

### Frontend (client/src/)
- **React 19 + Vite + Tailwind CSS v4** (standard Tailwind color classes, NOT CSS variables)
- **Zustand** for state: session-store (sessions, tabs, event parsing) + ui-store (theme, sidebar)
- **WebSocket client** (lib/ws.ts) auto-reconnects, broadcasts to all subscribers
- **Styling**: Uses `bg-zinc-*`, `dark:bg-zinc-*`, `text-zinc-*` palette with colored accents (blue, emerald, amber, violet, etc.)
- **DO NOT** use Tailwind v4 `@theme` CSS variable syntax like `bg-(--color-*)` — it doesn't resolve. Use standard classes.

### Key Design Decisions
- **Sessions always belong to a project** — Dashboard requires project selection before creating a session
- **Config-driven providers** — `config/providers.json` defines CLI commands. Add new providers (e.g., Copilot) by editing this JSON
- **File-based storage** — No database. JSON per entity, JSONL for conversation logs
- **MCP via CLI** — All MCP management goes through the Claude CLI, which writes to `~/.claude.json`. NEVER write MCP config to `~/.claude/settings.json` — the CLI doesn't read MCPs from there.
- **Dynamic marketplace** — Three tabs: Remote (HTTP servers from official registry, zero-config, instant connect), Local (npm packages, zero-config, via npx), Curated (static `config/mcps-registry.json` with setup modals). Remote and Local tabs fetch from `registry.modelcontextprotocol.io` API, cached server-side, refreshed every 30 min.
- **Zero-config only** — Remote/Local tabs only show servers with NO required auth headers or env vars. One-click install, no setup modals needed.

## API Routes (server/src/index.ts)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/providers | List CLI providers |
| GET/POST/DELETE | /api/sessions | Session CRUD |
| POST | /api/sessions/:id/send | Send message to session |
| POST | /api/sessions/:id/kill | Stop session |
| GET | /api/sessions/:id/conversation | Get conversation history |
| GET/POST/PUT/DELETE | /api/projects | Project CRUD |
| POST/DELETE | /api/projects/:id/sessions/:sid | Add/remove session from project |
| GET | /api/mcps/installed | List installed MCP servers (from ~/.claude.json) |
| GET | /api/mcps/registry | List curated MCPs (static fallback) |
| POST | /api/mcps/install | Install MCP from curated registry |
| GET | /api/mcps/marketplace | Dynamic marketplace (search, filter, paginate) |
| POST | /api/mcps/marketplace/install | Install from dynamic marketplace |
| POST/PUT/DELETE | /api/mcps | Custom MCP CRUD |
| GET/POST/PUT/DELETE | /api/agents | Agent CRUD (reads/writes ~/.claude/agents/*.md) |
| GET | /api/templates | List legacy agent templates |
| GET | /api/settings/claude | Read ~/.claude/settings.json |

## WebSocket Protocol (ws://localhost:3001/ws)

**Client -> Server:**
- `session:subscribe` / `session:unsubscribe` — attach/detach from session events
- `session:send` — send user message to active session
- `session:create` — create new session
- `session:kill` — stop session

**Server -> Client:**
- `session:event` — stream event from Claude CLI (assistant messages, tool calls, results)
- `session:status` — session status change
- `session:created` — new session metadata

## Adding New Features

### New agent
Use the Agents page "Create Agent" button — this opens a collaborative chat with Claude to design the agent. The result is saved as a `.md` file in `~/.claude/agents/` with YAML frontmatter (name, description, model, tools, mcpServers) and the system prompt as the body. The Claude CLI auto-discovers agents from this directory (`claude agents` lists them).

### New MCP to marketplace
Add entry to `config/mcps-registry.json` with name, description, command, args, env, category, installCmd. For MCPs needing post-install config, add a `setup` block with `instructions` string and `fields` array (each: key, type env/args, label, description, placeholder, helpUrl, required, secret).

### New CLI provider
Add entry to `config/providers.json` with name, command, args, env, healthCheck, models, defaultModel.

### New page
1. Create `client/src/pages/MyPage.tsx`
2. Add route in `client/src/App.tsx`
3. Add nav item in `client/src/components/layout/Sidebar.tsx`
4. Add API routes in `server/src/index.ts` if needed
