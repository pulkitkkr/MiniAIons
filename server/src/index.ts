import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SessionManager } from './services/session-manager.js';
import { McpManager } from './services/mcp-manager.js';
import { McpRegistryService } from './services/mcp-registry-service.js';
import { ProjectService } from './services/project-service.js';
import { WorkflowEngine } from './services/workflow-engine.js';
import { WorkflowService } from './services/workflow-service.js';
import { AgentService } from './services/agent-service.js';
import { ClientMessage, ProviderConfig } from './types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_DIR = path.join(ROOT, 'config');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const CLAUDE_JSON = path.join(process.env.HOME || '', '.claude.json');
const CLAUDE_SETTINGS = path.join(process.env.HOME || '', '.claude', 'settings.json');

async function main() {
  // Ensure data dirs
  await fs.mkdir(path.join(DATA_DIR, 'sessions'), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, 'conversations'), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, 'projects'), { recursive: true });

  // Load providers
  const providersRaw = JSON.parse(await fs.readFile(path.join(CONFIG_DIR, 'providers.json'), 'utf-8'));
  const providers: Record<string, ProviderConfig> = providersRaw;

  // Init services
  const sessionManager = new SessionManager(providers, DATA_DIR);
  const mcpManager = new McpManager(CLAUDE_JSON, path.join(CONFIG_DIR, 'mcps-registry.json'));
  const mcpRegistry = new McpRegistryService();
  mcpRegistry.init(); // background fetch — don't block startup
  const agentService = new AgentService();
  await agentService.init();
  const projectService = new ProjectService(DATA_DIR);
  sessionManager.setProjectService(projectService);
  const workflowService = new WorkflowService(DATA_DIR);
  await workflowService.init();
  await workflowService.seed();
  const workflowEngine = new WorkflowEngine(sessionManager, projectService, agentService, DATA_DIR);
  await workflowEngine.init();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Serve client in production
  const clientDist = path.join(ROOT, 'client', 'dist');
  try {
    await fs.access(clientDist);
    app.use(express.static(clientDist));
  } catch {}

  // --- REST API ---

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', sessions: sessionManager.listSessions().length });
  });

  // Providers
  app.get('/api/providers', async (_req, res) => {
    res.json(providers);
  });

  // Sessions
  app.get('/api/sessions', (_req, res) => {
    res.json(sessionManager.listSessions());
  });

  app.get('/api/sessions/:id', (req, res) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json(session);
  });

  app.post('/api/sessions', async (req, res) => {
    try {
      const opts = { ...req.body };
      // If a projectId is set and no explicit systemPrompt, use the project description
      if (opts.projectId && !opts.systemPrompt) {
        const project = await projectService.get(opts.projectId);
        if (project?.description?.trim()) {
          opts.systemPrompt = project.description;
        }
      }
      const session = await sessionManager.createSession(opts);
      res.json(session);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/sessions/:id', async (req, res) => {
    try {
      await sessionManager.deleteSession(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to delete session' });
    }
  });

  app.put('/api/sessions/:id/rename', async (req, res) => {
    try {
      const session = await sessionManager.renameSession(req.params.id, req.body.name);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(session);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/sessions/:id/send', async (req, res) => {
    try {
      await sessionManager.sendMessage(req.params.id, req.body.content, {
        effort: req.body.effort,
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/sessions/:id/compact', async (req, res) => {
    try {
      await sessionManager.sendMessage(req.params.id, '/compact');
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/sessions/:id/thinking', async (req, res) => {
    try {
      sessionManager.setThinking(req.params.id, req.body.enabled);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/sessions/:id/kill', async (req, res) => {
    await sessionManager.killSession(req.params.id);
    res.json({ ok: true });
  });

  // Conversation history
  app.get('/api/sessions/:id/conversation', async (req, res) => {
    try {
      const filePath = path.join(DATA_DIR, 'conversations', `${req.params.id}.jsonl`);
      const content = await fs.readFile(filePath, 'utf-8');
      const events = content.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      res.json(events);
    } catch {
      res.json([]);
    }
  });

  // Projects
  app.get('/api/projects', async (_req, res) => {
    res.json(await projectService.list());
  });

  app.post('/api/projects', async (req, res) => {
    const project = await projectService.create(req.body.name, req.body.description, req.body.color);
    res.json(project);
  });

  app.put('/api/projects/:id', async (req, res) => {
    const project = await projectService.update(req.params.id, req.body);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      await projectService.delete(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to delete project' });
    }
  });

  app.post('/api/projects/:id/sessions/:sessionId', async (req, res) => {
    await projectService.addSession(req.params.id, req.params.sessionId);
    res.json({ ok: true });
  });

  app.delete('/api/projects/:id/sessions/:sessionId', async (req, res) => {
    await projectService.removeSession(req.params.id, req.params.sessionId);
    res.json({ ok: true });
  });

  // MCPs
  app.get('/api/mcps/installed', async (_req, res) => {
    res.json(await mcpManager.listInstalled());
  });

  app.get('/api/mcps/registry', async (_req, res) => {
    res.json(await mcpManager.getRegistry());
  });

  app.post('/api/mcps/install', async (req, res) => {
    const result = await mcpManager.installFromRegistry(req.body.name, req.body.env, req.body.args);
    res.json(result);
  });

  app.post('/api/mcps', async (req, res) => {
    await mcpManager.addServer(req.body.name, req.body);
    res.json({ ok: true });
  });

  app.delete('/api/mcps/:name', async (req, res) => {
    try {
      await mcpManager.removeServer(req.params.name);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to remove MCP' });
    }
  });

  app.put('/api/mcps/:name', async (req, res) => {
    await mcpManager.updateServer(req.params.name, req.body);
    res.json({ ok: true });
  });

  // Dynamic marketplace (official MCP registry)
  app.get('/api/mcps/marketplace', async (_req, res) => {
    const { query, transport, page, pageSize } = _req.query;
    const result = mcpRegistry.search({
      query: query as string,
      transport: (transport as 'remote' | 'local' | 'all') || 'all',
      page: parseInt(page as string) || 1,
      pageSize: parseInt(pageSize as string) || 30,
    });
    res.json(result);
  });

  app.post('/api/mcps/marketplace/install', async (req, res) => {
    const result = await mcpManager.installFromMarketplace(req.body);
    res.json(result);
  });

  // Workflow runs (register BEFORE /api/workflows/:id to avoid route clash)
  app.get('/api/workflows/runs', (_req, res) => {
    res.json(workflowEngine.listRuns());
  });

  app.get('/api/workflows/runs/:id', (req, res) => {
    const run = workflowEngine.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Not found' });
    res.json(run);
  });

  app.delete('/api/workflows/runs/:id', (req, res) => {
    const deleted = workflowEngine.deleteRun(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });

  // Workflow definitions (CRUD)
  app.get('/api/workflows', async (_req, res) => {
    res.json(await workflowService.list());
  });

  app.get('/api/workflows/:id', async (req, res) => {
    const wf = await workflowService.get(req.params.id);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    res.json(wf);
  });

  app.post('/api/workflows', async (req, res) => {
    try {
      const wf = await workflowService.create(req.body);
      res.json(wf);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/workflows/:id', async (req, res) => {
    const wf = await workflowService.update(req.params.id, req.body);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    res.json(wf);
  });

  app.delete('/api/workflows/:id', async (req, res) => {
    const deleted = await workflowService.delete(req.params.id);
    if (!deleted) return res.status(403).json({ error: 'Cannot delete preset workflow' });
    res.json({ ok: true });
  });

  app.post('/api/workflows/:id/run', async (req, res) => {
    try {
      const wf = await workflowService.get(req.params.id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });
      const run = await workflowEngine.execute({
        workflowId: wf.id,
        name: wf.name,
        input: req.body.input,
        steps: wf.steps,
        model: req.body.model,
      });
      res.json({ runId: run.id, status: 'running' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/workflows/runs/:runId/steps/:stepId/complete', async (req, res) => {
    try {
      const run = await workflowEngine.completeStep(req.params.runId, req.params.stepId);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      res.json(run);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Agents (Claude Code subagents in ~/.claude/agents/)
  app.get('/api/agents', async (_req, res) => {
    res.json(await agentService.list());
  });

  app.get('/api/agents/:name', async (req, res) => {
    const agent = await agentService.get(req.params.name);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  });

  app.post('/api/agents', async (req, res) => {
    try {
      const agent = await agentService.create(req.body);
      res.json(agent);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/agents/:name', async (req, res) => {
    const agent = await agentService.update(req.params.name, req.body);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  });

  app.delete('/api/agents/:name', async (req, res) => {
    try {
      const deleted = await agentService.delete(req.params.name);
      if (!deleted) return res.status(404).json({ error: 'Agent not found' });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to delete agent' });
    }
  });

  // Agent templates (legacy)
  app.get('/api/templates', async (_req, res) => {
    try {
      const agentDir = path.join(TEMPLATES_DIR, 'agents');
      const files = await fs.readdir(agentDir);
      const templates = [];
      for (const f of files) {
        if (!f.endsWith('.md') || f.startsWith('_')) continue;
        const content = await fs.readFile(path.join(agentDir, f), 'utf-8');
        const nameMatch = content.match(/^#\s+(.+)/m);
        const descMatch = content.match(/^>\s+(.+)/m);
        templates.push({
          id: f.replace('.md', ''),
          name: nameMatch?.[1] || f.replace('.md', ''),
          description: descMatch?.[1] || '',
          file: f,
          content,
        });
      }
      res.json(templates);
    } catch {
      res.json([]);
    }
  });

  // Settings
  app.get('/api/settings/claude', async (_req, res) => {
    try {
      res.json(JSON.parse(await fs.readFile(CLAUDE_SETTINGS, 'utf-8')));
    } catch {
      res.json({});
    }
  });

  // Fallback to client (Express v5 syntax)
  app.get('/{*splat}', async (_req, res) => {
    try {
      await fs.access(path.join(clientDist, 'index.html'));
      res.sendFile(path.join(clientDist, 'index.html'));
    } catch {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // --- WebSocket ---
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Track workflow unsubscribe callbacks per WebSocket
  const wsWorkflowUnsubs = new Map<WebSocket, Map<string, () => void>>();

  wss.on('connection', (ws) => {
    wsWorkflowUnsubs.set(ws, new Map());

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'session:subscribe': {
            sessionManager.subscribe(msg.sessionId, ws);
            const buffer = sessionManager.getBuffer(msg.sessionId);
            for (let i = 0; i < buffer.length; i++) {
              ws.send(JSON.stringify({
                type: 'session:event',
                sessionId: msg.sessionId,
                event: buffer[i],
                index: i,
              }));
            }
            sessionManager.prepare(msg.sessionId).catch(() => {});
            break;
          }
          case 'session:unsubscribe':
            sessionManager.unsubscribe(msg.sessionId, ws);
            break;
          case 'session:send':
            await sessionManager.sendMessage(msg.sessionId, msg.content);
            break;
          case 'session:create': {
            const session = await sessionManager.createSession(msg.opts);
            sessionManager.subscribe(session.id, ws);
            ws.send(JSON.stringify({ type: 'session:created', session }));
            break;
          }
          case 'session:kill':
            await sessionManager.killSession(msg.sessionId);
            break;

          // Workflow subscriptions
          case 'workflow:subscribe': {
            const runId = msg.runId;
            const unsub = workflowEngine.subscribe(runId, (run) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'workflow:update', run }));
              }
            });
            wsWorkflowUnsubs.get(ws)?.set(runId, unsub);
            // Send current state
            const run = workflowEngine.getRun(runId);
            if (run && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'workflow:update', run }));
            }
            break;
          }
          case 'workflow:unsubscribe': {
            const unsub = wsWorkflowUnsubs.get(ws)?.get(msg.runId);
            if (unsub) { unsub(); wsWorkflowUnsubs.get(ws)?.delete(msg.runId); }
            break;
          }
        }
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      }
    });

    ws.on('close', () => {
      sessionManager.unsubscribeAll(ws);
      // Clean up workflow subscriptions
      const unsubs = wsWorkflowUnsubs.get(ws);
      if (unsubs) { unsubs.forEach((fn) => fn()); wsWorkflowUnsubs.delete(ws); }
    });
  });

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`\n  MiniAIons server running on http://localhost:${PORT}`);
    console.log(`  WebSocket available at ws://localhost:${PORT}/ws\n`);
  });
}

main().catch(console.error);
