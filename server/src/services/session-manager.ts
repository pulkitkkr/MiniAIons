import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { SessionMetadata, CreateSessionOpts, StreamEvent, ProviderConfig } from '../types/index.js';
import { ProjectService } from './project-service.js';

interface LiveSession {
  meta: SessionMetadata;
  process: ChildProcess | null;
  buffer: StreamEvent[];
  subscribers: Set<WebSocket>;
  hasHistory: boolean | null; // cached: does this session have prior turns?
}

const MAX_BUFFER = 10000;

export class SessionManager {
  private sessions = new Map<string, LiveSession>();
  private providers: Record<string, ProviderConfig>;
  private dataDir: string;
  private projectService: ProjectService | null = null;

  constructor(providers: Record<string, ProviderConfig>, dataDir: string) {
    this.providers = providers;
    this.dataDir = dataDir;
    this.loadExistingSessions();
  }

  setProjectService(ps: ProjectService) {
    this.projectService = ps;
  }

  private async loadExistingSessions() {
    try {
      const dir = path.join(this.dataDir, 'sessions');
      await fs.mkdir(dir, { recursive: true });
      const files = await fsSync.readdirSync(dir);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const data = JSON.parse(fsSync.readFileSync(path.join(dir, f), 'utf-8'));
        data.status = 'idle';
        // Pre-check history existence
        let hasHistory = false;
        try {
          const convPath = path.join(this.dataDir, 'conversations', `${data.id}.jsonl`);
          const stat = fsSync.statSync(convPath);
          hasHistory = stat.size > 0;
        } catch {}

        this.sessions.set(data.id, {
          meta: data,
          process: null,
          buffer: [],
          subscribers: new Set(),
          hasHistory,
        });
      }
    } catch {}
  }

  async createSession(opts: CreateSessionOpts): Promise<SessionMetadata> {
    const providerId = opts.providerId || 'claude';
    const provider = this.providers[providerId];
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);

    const id = randomUUID();
    const model = opts.model || provider.defaultModel;
    const cwd = opts.cwd || process.cwd();

    const meta: SessionMetadata = {
      id,
      name: opts.name || `Session ${this.sessions.size + 1}`,
      providerId,
      model,
      projectId: opts.projectId || null,
      status: 'idle',
      cwd,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      agentTemplate: opts.agentTemplate || null,
      systemPrompt: opts.systemPrompt || null,
      thinkingEnabled: false,
      tags: opts.tags || [],
    };

    const session: LiveSession = {
      meta,
      process: null,
      buffer: [],
      subscribers: new Set(),
      hasHistory: false,
    };

    this.sessions.set(id, session);
    await this.persistSession(meta);

    // Eagerly resolve system prompt from project
    await this.resolveSystemPrompt(session);

    if (opts.initialPrompt) {
      setTimeout(() => this.sendMessage(id, opts.initialPrompt!), 300);
    }

    return meta;
  }

  /**
   * Pre-resolve system prompt and cache history flag.
   * Called when user opens a session to front-load I/O.
   */
  async prepare(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    await this.resolveSystemPrompt(session);
    // Cache history check
    if (session.hasHistory === null || session.hasHistory === false) {
      if (session.buffer.some(e => e.type === 'result')) {
        session.hasHistory = true;
      } else {
        try {
          const convPath = path.join(this.dataDir, 'conversations', `${sessionId}.jsonl`);
          const stat = fsSync.statSync(convPath);
          session.hasHistory = stat.size > 0;
        } catch {
          session.hasHistory = false;
        }
      }
    }
  }

  setThinking(sessionId: string, enabled: boolean): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.meta.thinkingEnabled = enabled;
      this.persistSession(session.meta);
    }
  }

  async sendMessage(sessionId: string, content: string, opts?: { effort?: string }): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    if (session.process && session.meta.status === 'busy') {
      throw new Error('Session is busy processing a previous message');
    }

    const provider = this.providers[session.meta.providerId];
    if (!provider) throw new Error(`Unknown provider: ${session.meta.providerId}`);

    session.meta.status = 'busy';
    session.meta.lastActivityAt = new Date().toISOString();
    this.broadcast(sessionId, { type: 'session:status', sessionId, status: 'busy' });

    // Ensure system prompt is resolved
    await this.resolveSystemPrompt(session);

    // Build args
    const args = [...provider.args]; // -p --output-format stream-json --verbose
    if (session.meta.model) args.push('--model', session.meta.model);
    args.push('--permission-mode', 'auto');

    const effort = opts?.effort || (session.meta.thinkingEnabled ? 'max' : undefined);
    if (effort) args.push('--effort', effort);

    // Use cached history flag for instant decision
    const hasHistory = session.hasHistory ||
      session.buffer.some(e => e.type === 'result');

    if (hasHistory) {
      args.push('--resume', sessionId);
    } else {
      args.push('--session-id', sessionId);
    }

    if (session.meta.systemPrompt) {
      // Append presentation directive for non-technical audience
      const presentationHint = '\n\nPresentation rules:\n- Present information in clear, readable prose with bullet points, tables, and bold highlights.\n- Do NOT use code blocks unless the user explicitly asks for code or there is no other way to present the information.\n- Use markdown formatting: headers, bold, lists, tables. Keep it scannable and easy to read.\n- Write for a general audience, not programmers. Avoid jargon.';
      args.push('--system-prompt', session.meta.systemPrompt + presentationHint);
    }

    // Prompt as positional argument
    args.push(content);

    console.log(`[Session ${sessionId}] Spawning (${hasHistory ? 'resume' : 'new'}): ${provider.command} ...`);

    const child = spawn(provider.command, args, {
      cwd: session.meta.cwd,
      env: { ...process.env, ...provider.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    session.process = child;

    // Parse stdout NDJSON
    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      try {
        const event: StreamEvent = JSON.parse(line);
        this.handleEvent(session, event);
      } catch {}
    });

    // Capture stderr
    let stderrBuf = '';
    child.stderr?.on('data', (chunk) => { stderrBuf += chunk.toString(); });

    child.on('exit', (code) => {
      session.process = null;
      // Mark that this session now has history
      session.hasHistory = true;

      if (code !== 0 && stderrBuf.trim()) {
        this.handleEvent(session, {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: `**Error (exit code ${code}):**\n\`\`\`\n${stderrBuf.trim()}\n\`\`\`` }],
          },
        });
      }

      if (session.meta.status === 'busy') {
        session.meta.status = 'idle';
      }
      this.broadcast(sessionId, { type: 'session:status', sessionId, status: session.meta.status });
      this.persistSession(session.meta);
    });

    child.on('error', (err) => {
      session.process = null;
      session.meta.status = 'error';
      this.handleEvent(session, {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: `**Failed to start CLI:** ${err.message}` }] },
      });
      this.broadcast(sessionId, { type: 'session:status', sessionId, status: 'error' });
      this.persistSession(session.meta);
    });
  }

  /**
   * Send message and wait for the CLI to finish. Returns the result text.
   * Used by the workflow engine to chain steps.
   */
  sendMessageAndWait(sessionId: string, content: string, opts?: { effort?: string }): Promise<{ text: string; costUsd: number; error: boolean }> {
    return new Promise(async (resolve) => {
      const session = this.sessions.get(sessionId);
      if (!session) { resolve({ text: '', costUsd: 0, error: true }); return; }

      // Collect result text from events
      let resultText = '';
      let costUsd = 0;
      let isError = false;

      const onEvent = (ev: StreamEvent) => {
        if (ev.type === 'result') {
          resultText = (ev as any).result || resultText;
          costUsd = ev.total_cost_usd || 0;
          isError = ev.is_error || false;
        }
        // Also capture text from assistant messages
        if (ev.type === 'assistant' && ev.message?.content) {
          for (const block of ev.message.content) {
            if (block.type === 'text' && block.text) {
              resultText = block.text; // keep last text block
            }
          }
        }
      };

      // Temporarily hook into events
      const origHandler = this.handleEvent.bind(this);
      const hookedHandler = (s: LiveSession, ev: StreamEvent) => {
        if (s.meta.id === sessionId) onEvent(ev);
        origHandler(s, ev);
      };
      this.handleEvent = hookedHandler as any;

      try {
        await this.sendMessage(sessionId, content, opts);
      } catch (e: any) {
        this.handleEvent = origHandler;
        resolve({ text: e.message, costUsd: 0, error: true });
        return;
      }

      // Wait for process to exit
      const checkInterval = setInterval(() => {
        if (!session.process) {
          clearInterval(checkInterval);
          this.handleEvent = origHandler;
          resolve({ text: resultText, costUsd, error: isError });
        }
      }, 500);

      // Safety timeout: 5 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        this.handleEvent = origHandler;
        resolve({ text: resultText || 'Workflow step timed out', costUsd, error: true });
      }, 300000);
    });
  }

  private captureInitData(session: LiveSession, event: any) {
    if (event.tools) (session.meta as any).availableTools = event.tools;
    if (event.mcp_servers) (session.meta as any).mcpServers = event.mcp_servers;
    if (event.model) (session.meta as any).activeModel = event.model;
    if (event.skills) (session.meta as any).availableSkills = event.skills;
    this.persistSession(session.meta);
  }

  private async resolveSystemPrompt(session: LiveSession) {
    if (!session.meta.systemPrompt && session.meta.projectId && this.projectService) {
      const project = await this.projectService.get(session.meta.projectId);
      if (project?.description?.trim()) {
        session.meta.systemPrompt = project.description;
        this.persistSession(session.meta);
      }
    }
  }

  private handleEvent(session: LiveSession, event: StreamEvent) {
    if (session.buffer.length >= MAX_BUFFER) session.buffer.shift();
    session.buffer.push(event);

    if (event.type === 'system' && (event as any).subtype === 'init') {
      this.captureInitData(session, event);
    }

    if (event.type === 'result') {
      if (event.total_cost_usd !== undefined) session.meta.costUsd = event.total_cost_usd;
      if (event.usage) {
        session.meta.inputTokens += event.usage.input_tokens || 0;
        session.meta.outputTokens += event.usage.output_tokens || 0;
      }
      session.meta.status = 'idle';
      session.hasHistory = true;
      this.persistSession(session.meta);
    }

    if (event.type === 'assistant' && event.message) {
      session.meta.lastActivityAt = new Date().toISOString();
    }

    this.broadcast(session.meta.id, {
      type: 'session:event',
      sessionId: session.meta.id,
      event,
      index: session.buffer.length - 1,
    });

    this.appendConversation(session.meta.id, event);
  }

  async killSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.process) { session.process.kill('SIGTERM'); session.process = null; }
    session.meta.status = 'stopped';
    await this.persistSession(session.meta);
    this.broadcast(sessionId, { type: 'session:status', sessionId, status: 'stopped' });
  }

  subscribe(sessionId: string, ws: WebSocket) {
    const session = this.sessions.get(sessionId);
    if (session) session.subscribers.add(ws);
  }

  unsubscribe(sessionId: string, ws: WebSocket) {
    const session = this.sessions.get(sessionId);
    if (session) session.subscribers.delete(ws);
  }

  unsubscribeAll(ws: WebSocket) {
    for (const session of this.sessions.values()) {
      session.subscribers.delete(ws);
    }
  }

  getBuffer(sessionId: string): StreamEvent[] {
    return this.sessions.get(sessionId)?.buffer || [];
  }

  listSessions(): SessionMetadata[] {
    return Array.from(this.sessions.values()).map((s) => s.meta);
  }

  getSession(sessionId: string): SessionMetadata | undefined {
    return this.sessions.get(sessionId)?.meta;
  }

  async renameSession(sessionId: string, name: string): Promise<SessionMetadata | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.meta.name = name;
    await this.persistSession(session.meta);
    this.broadcast(sessionId, { type: 'session:status', sessionId, status: session.meta.status, metadata: { name } });
    return session.meta;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.killSession(sessionId);
    this.sessions.delete(sessionId);
    try {
      await fs.unlink(path.join(this.dataDir, 'sessions', `${sessionId}.json`));
      await fs.unlink(path.join(this.dataDir, 'conversations', `${sessionId}.jsonl`));
    } catch {}
  }

  private broadcast(sessionId: string, msg: any) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const data = JSON.stringify(msg);
    for (const ws of session.subscribers) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  private async persistSession(meta: SessionMetadata) {
    const dir = path.join(this.dataDir, 'sessions');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${meta.id}.json`), JSON.stringify(meta, null, 2));
  }

  private async appendConversation(sessionId: string, event: StreamEvent) {
    const dir = path.join(this.dataDir, 'conversations');
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, `${sessionId}.jsonl`), JSON.stringify(event) + '\n');
  }
}
