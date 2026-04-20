import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { wsClient } from '../lib/ws';
import { useSessionStore } from '../stores/session-store';
import { cn } from '../lib/utils';
import {
  Play, Plus, Trash2, Edit3, Bot, Cpu, Wrench, Puzzle, ArrowLeft,
  Send, Loader2, Sparkles, X, ChevronDown, Save
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface Agent {
  name: string;
  description: string;
  model: string;
  tools: string[];
  mcpServers: string[];
  systemPrompt: string;
}

const MODEL_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  haiku:  { label: 'Haiku', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  sonnet: { label: 'Sonnet', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  opus:   { label: 'Opus', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30' },
};

const AVAILABLE_TOOLS = [
  'Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash',
  'WebSearch', 'WebFetch', 'Agent', 'NotebookEdit',
];

// ── Builder system prompt ───────────────────────────────────────────────────

const BUILDER_SYSTEM_PROMPT = `You are an Agent Builder. You help the user design a Claude Code subagent through conversation.

Your job is to understand what the user needs and collaboratively design the perfect agent configuration.

Ask about:
1. **Purpose** — What should this agent do? What's its role?
2. **Model** — haiku (fast & cheap), sonnet (balanced), or opus (most capable)
3. **Tools** — Which tools should it have access to? Available: Read, Glob, Grep, Edit, Write, Bash, WebSearch, WebFetch, Agent, NotebookEdit
4. **MCP Servers** — Should it use any installed MCP plugins?
5. **System Prompt** — What instructions define its behavior?

After gathering requirements (or when the user asks), output the complete agent config wrapped in a special block:

\`\`\`agent-config
name: agent-name-here
description: One-line description of what this agent does
model: sonnet
tools: Read, Glob, Grep, WebSearch
mcpServers:
---
The full system prompt for the agent goes here.
Write it as natural instructions — this is what the agent will follow.
\`\`\`

Rules:
- The name must be lowercase with hyphens only (e.g., "code-reviewer", "travel-planner")
- The description should be concise — it tells Claude when to delegate to this agent
- Always include an agent-config block when you have enough info
- Update the block each time the user refines requirements
- Be conversational and helpful — ask one or two questions at a time, not all at once
- Start by asking what the user wants their agent to do`;

// ── Parse agent-config blocks from text ─────────────────────────────────────

function parseAgentConfig(text: string): Partial<Agent> | null {
  const match = text.match(/```agent-config\s*\n([\s\S]*?)```/);
  if (!match) return null;

  const raw = match[1];
  const divider = raw.indexOf('---');
  if (divider === -1) return null;

  const header = raw.slice(0, divider);
  const systemPrompt = raw.slice(divider + 3).trim();

  const get = (key: string) => {
    const m = header.match(new RegExp(`^${key}:\\s*(.+)`, 'm'));
    return m ? m[1].trim() : '';
  };

  const name = get('name');
  const description = get('description');
  const model = get('model') || 'sonnet';
  const toolsRaw = get('tools');
  const tools = toolsRaw ? toolsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
  const mcpRaw = get('mcpServers');
  const mcpServers = mcpRaw ? mcpRaw.split(',').map(m => m.trim()).filter(Boolean) : [];

  if (!name) return null;
  return { name, description, model, tools, mcpServers, systemPrompt };
}

// ── Agent Card ──────────────────────────────────────────────────────────────

function AgentCard({ agent, onLaunch, onEdit, onDelete }: {
  agent: Agent;
  onLaunch: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const mc = MODEL_COLORS[agent.model] || MODEL_COLORS.sonnet;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:shadow-lg transition-all group">
      <div className={cn('h-1.5 bg-gradient-to-r',
        agent.model === 'opus' ? 'from-violet-500 to-purple-500' :
        agent.model === 'haiku' ? 'from-emerald-500 to-teal-500' :
        'from-blue-500 to-sky-500'
      )} />
      <div className="p-5">
        <div className="flex items-start gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">{agent.name}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed line-clamp-2">{agent.description}</p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', mc.bg, mc.color)}>{mc.label}</span>
          {agent.tools.length > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center gap-1">
              <Wrench className="w-2.5 h-2.5" /> {agent.tools.length} tools
            </span>
          )}
          {agent.mcpServers.length > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center gap-1">
              <Puzzle className="w-2.5 h-2.5" /> {agent.mcpServers.length} MCPs
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={onLaunch}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-sm active:scale-[0.98] transition-all">
            <Play className="w-3.5 h-3.5" /> Launch Session
          </button>
          <button onClick={onEdit}
            className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-all">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agent Builder (Collaborative Chat) ──────────────────────────────────────

function AgentBuilder({ onSave, onCancel, editAgent }: {
  onSave: (agent: Agent) => void;
  onCancel: () => void;
  editAgent?: Agent | null;
}) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [parsedAgent, setParsedAgent] = useState<Partial<Agent> | null>(editAgent || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initedRef = useRef(false);

  // Create a builder session on mount (guarded against strict mode double-mount)
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    const initSession = async () => {
      const prompt = editAgent
        ? BUILDER_SYSTEM_PROMPT + `\n\nThe user wants to edit an existing agent. Here is the current config:\n\n\`\`\`agent-config\nname: ${editAgent.name}\ndescription: ${editAgent.description}\nmodel: ${editAgent.model}\ntools: ${editAgent.tools.join(', ')}\nmcpServers: ${editAgent.mcpServers.join(', ')}\n---\n${editAgent.systemPrompt}\n\`\`\`\n\nStart by showing this config and ask what they'd like to change.`
        : BUILDER_SYSTEM_PROMPT;

      const session = await api.createSession({
        name: 'Agent Builder',
        model: 'sonnet',
        systemPrompt: prompt,
        permissionMode: 'auto',
      });
      setSessionId(session.id);

      // Send initial message to get the conversation started
      const initialMsg = editAgent
        ? `I want to edit the "${editAgent.name}" agent.`
        : 'I want to create a new Claude agent.';
      await sendToBuilder(session.id, initialMsg);
    };
    initSession();
  }, []);

  const sendToBuilder = async (sid: string, text: string) => {
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);

    try {
      await api.sendMessage(sid, text);

      // Poll for response by watching conversation
      const pollResponse = async () => {
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const events = await api.getConversation(sid);
          // Find the latest assistant text
          let latestText = '';
          for (const ev of events) {
            if (ev.type === 'assistant' && ev.message?.content) {
              for (const block of ev.message.content) {
                if (block.type === 'text') latestText = block.text;
              }
            }
          }
          if (latestText && !messages.some(m => m.text === latestText)) {
            setMessages(prev => {
              // Avoid duplicate
              if (prev[prev.length - 1]?.text === latestText) return prev;
              return [...prev, { role: 'assistant', text: latestText }];
            });

            // Try to parse agent config from response
            const config = parseAgentConfig(latestText);
            if (config) setParsedAgent(config);

            setLoading(false);
            return;
          }
        }
        setLoading(false);
      };
      pollResponse();
    } catch (e: any) {
      setLoading(false);
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e.message}` }]);
    }
  };

  const handleSend = () => {
    if (!input.trim() || !sessionId || loading) return;
    const text = input;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    sendToBuilder(sessionId, text);
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const canSave = parsedAgent?.name && parsedAgent?.description && parsedAgent?.systemPrompt;

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {/* Chat panel */}
      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {editAgent ? `Edit: ${editAgent.name}` : 'Agent Builder'}
            </h3>
            <p className="text-[10px] text-zinc-400">Describe your agent — Claude will help you design it</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-3', msg.role === 'user' && 'justify-end')}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div className={cn(
                'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
              )}>
                <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="flex items-center gap-2 px-4 py-3">
                <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                <span className="text-[12px] text-zinc-400">Designing...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex gap-3 items-end">
            <textarea ref={inputRef} value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Describe what your agent should do..."
              rows={1}
              className="flex-1 px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
              style={{ minHeight: 46, maxHeight: 120 }} />
            <button onClick={handleSend} disabled={!input.trim() || loading}
              className="h-[46px] w-[46px] shrink-0 rounded-2xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-30 shadow-sm transition-all">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Preview panel */}
      <div className="w-80 shrink-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Agent Preview</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {parsedAgent ? (
            <>
              <div>
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Name</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{parsedAgent.name}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Description</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">{parsedAgent.description || '—'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Model</div>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                  MODEL_COLORS[parsedAgent.model || 'sonnet']?.bg,
                  MODEL_COLORS[parsedAgent.model || 'sonnet']?.color
                )}>{MODEL_COLORS[parsedAgent.model || 'sonnet']?.label || parsedAgent.model}</span>
              </div>
              {(parsedAgent.tools?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Tools</div>
                  <div className="flex flex-wrap gap-1">{parsedAgent.tools!.map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 font-medium">{t}</span>
                  ))}</div>
                </div>
              )}
              {(parsedAgent.mcpServers?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">MCP Servers</div>
                  <div className="flex flex-wrap gap-1">{parsedAgent.mcpServers!.map(m => (
                    <span key={m} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-900/30 font-medium">{m}</span>
                  ))}</div>
                </div>
              )}
              {parsedAgent.systemPrompt && (
                <div>
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">System Prompt</div>
                  <pre className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-zinc-100 dark:border-zinc-700/50">
                    {parsedAgent.systemPrompt}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <Bot className="w-10 h-10 text-zinc-200 dark:text-zinc-700 mb-3" />
              <p className="text-sm font-medium text-zinc-400">No config yet</p>
              <p className="text-xs text-zinc-400 mt-1">Chat with Claude to design your agent</p>
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => {
              if (parsedAgent && canSave) {
                onSave({
                  name: parsedAgent.name!,
                  description: parsedAgent.description!,
                  model: parsedAgent.model || 'sonnet',
                  tools: parsedAgent.tools || [],
                  mcpServers: parsedAgent.mcpServers || [],
                  systemPrompt: parsedAgent.systemPrompt!,
                });
              }
            }}
            disabled={!canSave}
            className="w-full h-10 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" />
            {editAgent ? 'Update Agent' : 'Create Agent'}
          </button>
          {canSave && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 text-center mt-2">
              Saves to ~/.claude/agents/ — visible to Claude CLI
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const navigate = useNavigate();
  const { upsertSession, openTab } = useSessionStore();

  const loadAgents = () => api.getAgents().then(setAgents);
  useEffect(() => { loadAgents(); }, []);

  const handleLaunch = async (agent: Agent) => {
    const session = await api.createSession({
      name: agent.name,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      permissionMode: 'auto',
    });
    upsertSession(session.id, { ...session, messages: [], provider: session.providerId });
    openTab(session.id);
    wsClient.send({ type: 'session:subscribe', sessionId: session.id });
    navigate(`/session/${session.id}`);
  };

  const handleSave = async (agent: Agent) => {
    try {
      if (editAgent) {
        await api.updateAgent(editAgent.name, agent);
      } else {
        await api.createAgent(agent);
      }
      await loadAgents();
      setView('list');
      setEditAgent(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete agent "${name}"? This removes it from ~/.claude/agents/`)) return;
    try {
      await api.deleteAgent(name);
      await loadAgents();
    } catch (e: any) {
      alert(`Failed to delete agent: ${e.message}`);
    }
  };

  if (view === 'builder') {
    return (
      <AgentBuilder
        editAgent={editAgent}
        onSave={handleSave}
        onCancel={() => { setView('list'); setEditAgent(null); }}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Agents</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Claude Code subagents — real agents registered with the CLI
          </p>
        </div>
        <button onClick={() => { setEditAgent(null); setView('builder'); }}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm transition-all">
          <Plus className="w-4 h-4" /> Create Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
            <Bot className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
          </div>
          <h3 className="text-base font-semibold text-zinc-600 dark:text-zinc-400">No agents yet</h3>
          <p className="text-sm text-zinc-400 mt-1 mb-5">Create your first agent — Claude will help you design it</p>
          <button onClick={() => { setEditAgent(null); setView('builder'); }}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">
            <Plus className="w-4 h-4" /> Create Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.name}
              agent={agent}
              onLaunch={() => handleLaunch(agent)}
              onEdit={() => { setEditAgent(agent); setView('builder'); }}
              onDelete={() => handleDelete(agent.name)}
            />
          ))}

          {/* Create card */}
          <button onClick={() => { setEditAgent(null); setView('builder'); }}
            className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/10 transition-all">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
              <Plus className="w-7 h-7 text-zinc-300 dark:text-zinc-600" />
            </div>
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Create Agent</p>
            <p className="text-xs text-zinc-400 mt-1">Chat with Claude to design it</p>
          </button>
        </div>
      )}
    </div>
  );
}
