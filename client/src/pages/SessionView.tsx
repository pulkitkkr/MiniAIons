import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/session-store';
import { wsClient } from '../lib/ws';
import { api } from '../lib/api';
import { cn, formatCost, formatTokens } from '../lib/utils';
import {
  Send, Square, Loader2, ChevronDown, ChevronRight, Brain,
  Terminal, FileText, Edit3, Search, Globe, Copy, Check,
  Wrench, AlertCircle, FileCode, FolderSearch, Cpu, Coins, X, Puzzle, Sparkles, Shrink, Trash2,
  PanelRightClose, PanelRight, RotateCcw, Clock, Info, Clipboard, HelpCircle, Bot
} from 'lucide-react';
import 'highlight.js/styles/github-dark-dimmed.min.css';
import { renderMarkdown } from '../lib/markdown';

/* ── Tool call meta ── */
const TOOL_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  Bash:      { icon: Terminal, label: 'Terminal', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  Read:      { icon: FileText, label: 'Read File', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  Edit:      { icon: Edit3, label: 'Edit File', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  Write:     { icon: FileCode, label: 'Write File', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  Grep:      { icon: Search, label: 'Search', color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950/30' },
  Glob:      { icon: FolderSearch, label: 'Find Files', color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30' },
  WebFetch:  { icon: Globe, label: 'Fetch', color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-950/30' },
  WebSearch: { icon: Globe, label: 'Web Search', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30' },
  Agent:     { icon: Brain, label: 'Sub-Agent', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30' },
};

function getToolSummary(name: string, input: any): string {
  if (name === 'Bash') return input?.command?.slice(0, 80) || '';
  if (name === 'Read' || name === 'Edit' || name === 'Write') return input?.file_path || '';
  if (name === 'Grep') return `"${input?.pattern}"`;
  if (name === 'Glob') return input?.pattern || '';
  if (name === 'Agent') return input?.description || '';
  return JSON.stringify(input).slice(0, 60);
}

/* ── Sub-components ── */

function ToolCallCard({ block }: { block: any }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[block.name] || { icon: Wrench, label: block.name, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' };
  const Icon = meta.icon;
  return (
    <div className="my-2 rounded-lg border border-zinc-200 dark:border-zinc-700/60 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', meta.bg)}>
          <Icon className={cn('w-3 h-3', meta.color)} strokeWidth={2} />
        </div>
        <span className={cn('text-[12px] font-semibold shrink-0', meta.color)}>{meta.label}</span>
        <span className="text-[11px] text-zinc-400 truncate flex-1 font-mono">{getToolSummary(block.name, block.input)}</span>
        <span className={cn(
          'shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider',
          block.status === 'pending' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
          block.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
          'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
        )}>{block.status === 'pending' ? 'running' : block.status}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-700/40 space-y-2">
          {/* Input */}
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-2 mb-1">Input</div>
            <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap font-mono text-zinc-500 dark:text-zinc-400 max-h-40 overflow-y-auto bg-zinc-50 dark:bg-zinc-900 rounded-lg p-2.5 border border-zinc-100 dark:border-zinc-800">
              {JSON.stringify(block.input, null, 2)}
            </pre>
          </div>
          {/* Result (merged from tool_result) */}
          {block.result && (
            <div>
              <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Output</div>
              <pre className={cn(
                'text-[11px] overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto rounded-lg p-2.5 border',
                block.status === 'error'
                  ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400'
                  : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'
              )}>
                {block.result.length > 500 ? block.result.slice(0, 500) + '\n... (truncated)' : block.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AskUserQuestionCard({ block, onAnswer }: { block: any; onAnswer: (answer: string) => void }) {
  const [customAnswer, setCustomAnswer] = useState('');
  const question = block.input?.question || block.input?.text || 'The agent has a question for you';
  const options: string[] = block.input?.options || [];
  const isAnswered = block.status === 'success';
  const answer = block.result;

  return (
    <div className={cn(
      'my-3 rounded-xl border-2 overflow-hidden transition-all',
      isAnswered
        ? 'border-zinc-200 dark:border-zinc-700/60'
        : 'border-blue-300 dark:border-blue-700/60 shadow-sm shadow-blue-500/5'
    )}>
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2.5 px-4 py-3',
        isAnswered ? 'bg-zinc-50 dark:bg-zinc-800/40' : 'bg-blue-50 dark:bg-blue-950/30'
      )}>
        <div className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
          isAnswered ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
        )}>
          <HelpCircle className={cn('w-4 h-4', isAnswered ? 'text-emerald-500' : 'text-blue-500')} />
        </div>
        <span className={cn('text-[12px] font-semibold', isAnswered ? 'text-zinc-500' : 'text-blue-700 dark:text-blue-300')}>
          {isAnswered ? 'Question (answered)' : 'Question — Your input needed'}
        </span>
      </div>

      {/* Question text */}
      <div className="px-4 py-3">
        <p className="text-[14px] text-zinc-800 dark:text-zinc-200 leading-relaxed font-medium">{question}</p>
      </div>

      {/* Answered state */}
      {isAnswered && answer && (
        <div className="px-4 pb-3">
          <div className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
            <p className="text-xs text-emerald-700 dark:text-emerald-400">{answer}</p>
          </div>
        </div>
      )}

      {/* Unanswered — show options + free text input */}
      {!isAnswered && (
        <div className="px-4 pb-4 space-y-3">
          {/* Option buttons */}
          {options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {options.map((opt, i) => (
                <button key={i} onClick={() => onAnswer(opt)}
                  className="px-4 py-2 rounded-xl border border-blue-200 dark:border-blue-700/50 bg-white dark:bg-zinc-800 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-600 active:scale-[0.98] transition-all">
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* Free text input */}
          <div className="flex gap-2">
            <input
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && customAnswer.trim()) { onAnswer(customAnswer.trim()); setCustomAnswer(''); } }}
              placeholder={options.length > 0 ? 'Or type your own answer...' : 'Type your answer...'}
              className="flex-1 h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
            <button
              onClick={() => { if (customAnswer.trim()) { onAnswer(customAnswer.trim()); setCustomAnswer(''); } }}
              disabled={!customAnswer.trim()}
              className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-30 shadow-sm transition-all">
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const wordCount = text.split(/\s+/).length;
  return (
    <div className="my-2 rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/30">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-[12px]">
        <Brain className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-zinc-500 dark:text-zinc-400">{open ? 'Hide reasoning' : 'Reasoning'}</span>
        <span className="text-zinc-300 dark:text-zinc-600 text-[10px]">{wordCount} words</span>
        <ChevronDown className={cn('ml-auto w-3.5 h-3.5 text-zinc-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-zinc-200 dark:border-zinc-700/40 px-3 py-3">
          <div className="text-[12px] text-zinc-400 dark:text-zinc-500 italic leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap">{text}</div>
        </div>
      )}
    </div>
  );
}

function ToolResultBlock({ block }: { block: any }) {
  const [expanded, setExpanded] = useState(false);
  const content = block.content || '';
  const isLong = content.length > 200;
  return (
    <div className={cn('my-1.5 p-2.5 rounded-lg text-[11px] font-mono max-h-40 overflow-y-auto border',
      block.isError ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400'
      : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700/50 text-zinc-500 dark:text-zinc-400')}>
      <pre className="whitespace-pre-wrap leading-relaxed">{isLong && !expanded ? content.slice(0, 200) + '...' : content}</pre>
      {isLong && !expanded && <button onClick={() => setExpanded(true)} className="mt-1 text-blue-500 text-[10px] font-sans font-medium hover:underline">Show full</button>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      title="Copy message"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Clipboard className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ── Right sidebar ── */
function SessionInfoSidebar({ session, open, onClose }: { session: any; open: boolean; onClose: () => void }) {
  const [installedMcps, setInstalledMcps] = useState<any[]>([]);
  useEffect(() => { if (open) api.getInstalledMcps().then(setInstalledMcps).catch(() => {}); }, [open]);

  if (!open) return null;

  const tools: string[] = session.availableTools || [];
  const sessionMcpNames = new Set((session.mcpServers || []).map((m: any) => typeof m === 'string' ? m : m.name));
  const allMcps = [
    ...(session.mcpServers || []),
    ...installedMcps.filter((m) => !sessionMcpNames.has(m.name)),
  ];
  const skills: string[] = session.availableSkills || [];
  const hasAny = tools.length > 0 || allMcps.length > 0 || skills.length > 0;

  return (
    <div className="w-60 shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto">
      <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-3 py-2.5 flex items-center justify-between z-10">
        <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Info</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X className="w-3 h-3" /></button>
      </div>
      <div className="p-3 space-y-4">
        <div>
          <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Model</div>
          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{session.activeModel || session.model}</div>
        </div>
        {session.systemPrompt && (
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">System Prompt</div>
            <pre className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto bg-zinc-50 dark:bg-zinc-800/50 rounded p-2 border border-zinc-100 dark:border-zinc-700/50">{session.systemPrompt.slice(0, 200)}{session.systemPrompt.length > 200 ? '...' : ''}</pre>
          </div>
        )}
        {tools.length > 0 && (
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Wrench className="w-2.5 h-2.5 text-blue-500" /> Tools ({tools.length})</div>
            <div className="flex flex-wrap gap-1">{tools.map((t) => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 font-medium">{t}</span>)}</div>
          </div>
        )}
        {allMcps.length > 0 && (
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Puzzle className="w-2.5 h-2.5 text-violet-500" /> Plugins ({allMcps.length})</div>
            <div className="flex flex-wrap gap-1">{allMcps.map((m: any, i: number) => <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-900/30 font-medium">{typeof m === 'string' ? m : m.name}</span>)}</div>
          </div>
        )}
        {skills.length > 0 && (
          <div>
            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Sparkles className="w-2.5 h-2.5 text-emerald-500" /> Skills ({skills.length})</div>
            <div className="flex flex-wrap gap-1">{skills.map((s) => <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 font-medium">/{s}</span>)}</div>
          </div>
        )}
        {!hasAny && (
          <div className="text-center py-4">
            <Info className="w-5 h-5 text-zinc-300 dark:text-zinc-600 mx-auto mb-1" />
            <p className="text-[10px] text-zinc-400">Send a message to see available tools</p>
          </div>
        )}
        <div>
          <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Session ID</div>
          <div className="text-[9px] font-mono text-zinc-400 break-all select-all">{session.id}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Empty state suggestions ── */
const SUGGESTIONS = [
  { title: 'Plan my week', prompt: 'Help me plan my upcoming week. I want to balance work, personal errands, and some downtime.' },
  { title: 'Compare options', prompt: 'I need help comparing a few options and making a decision. Let me tell you what I am looking at.' },
  { title: 'Research a topic', prompt: 'I want to learn about a topic. Help me research it and give me a clear summary.' },
  { title: 'Budget check', prompt: 'Help me review my spending this month and suggest where I can save money.' },
];

/* ── Main Component ── */
export default function SessionView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const session = useSessionStore((s) => sessionId ? s.sessions[sessionId] : undefined);
  const appendEvent = useSessionStore((s) => s.appendEvent);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [agents, setAgents] = useState<any[]>([]);
  const [agentMenu, setAgentMenu] = useState<{ open: boolean; filter: string; index: number; triggerPos: number }>({ open: false, filter: '', index: 0, triggerPos: -1 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const toggleThinking = async () => { if (!sessionId) return; const next = !thinkingEnabled; setThinkingEnabled(next); await api.setThinking(sessionId, next); };

  // Load agents for # command
  useEffect(() => { api.getAgents().then(setAgents).catch(() => {}); }, []);

  useEffect(() => {
    if (!sessionId) return;
    wsClient.send({ type: 'session:subscribe', sessionId });
    if (!session?.messages?.length) {
      api.getConversation(sessionId).then((events) => events.forEach((e) => appendEvent(sessionId, e)));
    }
    return () => { wsClient.send({ type: 'session:unsubscribe', sessionId }); };
  }, [sessionId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [session?.messages?.length]);
  useEffect(() => { if (session?.status === 'idle') setLoading(false); }, [session?.status]);

  const doSend = async (text: string) => {
    if (!text.trim() || !sessionId) return;
    setInput('');
    setLoading(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    // Optimistic user message
    useSessionStore.setState((state) => ({
      sessions: { ...state.sessions, [sessionId]: { ...state.sessions[sessionId], messages: [...(state.sessions[sessionId]?.messages || []), { id: crypto.randomUUID(), role: 'user' as const, blocks: [{ type: 'text' as const, text }], timestamp: new Date().toISOString() }], status: 'busy' } },
    }));
    try { await api.sendMessage(sessionId, text, thinkingEnabled ? 'max' : undefined); } catch (e: any) { setLoading(false); alert(e.message); }
  };
  const handleSend = () => { setAgentMenu({ open: false, filter: '', index: 0, triggerPos: -1 }); doSend(input); };

  // Compute filtered agents for the # menu
  const filteredAgents = agents.filter(a =>
    !agentMenu.filter || a.name.toLowerCase().includes(agentMenu.filter.toLowerCase()) || a.description?.toLowerCase().includes(agentMenu.filter.toLowerCase())
  );

  const selectAgent = (agent: any) => {
    // Replace #filter with #agent-name in the input
    const before = input.slice(0, agentMenu.triggerPos);
    const after = input.slice(agentMenu.triggerPos + 1 + agentMenu.filter.length); // +1 for the #
    const newInput = `${before}#${agent.name} ${after}`;
    setInput(newInput);
    setAgentMenu({ open: false, filter: '', index: 0, triggerPos: -1 });
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';

    // Only run # detection if we have agents
    if (agents.length === 0) return;

    // Detect # trigger
    const cursorPos = e.target.selectionStart ?? val.length;
    let hashPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      const ch = val[i];
      if (ch === '#') {
        if (i === 0 || /\s/.test(val[i - 1])) hashPos = i;
        break;
      }
      if (/\s/.test(ch)) break;
    }

    if (hashPos >= 0) {
      const filter = val.slice(hashPos + 1, cursorPos);
      setAgentMenu({ open: true, filter, index: 0, triggerPos: hashPos });
    } else if (agentMenu.open) {
      setAgentMenu({ open: false, filter: '', index: 0, triggerPos: -1 });
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (agentMenu.open && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAgentMenu(m => ({ ...m, index: Math.min(m.index + 1, filteredAgents.length - 1) }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAgentMenu(m => ({ ...m, index: Math.max(m.index - 1, 0) }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectAgent(filteredAgents[agentMenu.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAgentMenu({ open: false, filter: '', index: 0, triggerPos: -1 });
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!session) return <div className="flex flex-col items-center justify-center h-[60vh]"><AlertCircle className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mb-3" /><p className="text-sm text-zinc-400">Session not found</p></div>;

  const allText = (msg: any) => msg.blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Chat column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
          <div className="relative shrink-0">
            <div className={cn('w-2 h-2 rounded-full', session.status === 'busy' ? 'bg-amber-400' : session.status === 'idle' ? 'bg-emerald-400' : session.status === 'error' ? 'bg-red-400' : 'bg-zinc-300')} />
            {session.status === 'busy' && <div className="absolute inset-0 w-2 h-2 rounded-full bg-amber-400 animate-ping opacity-50" />}
          </div>
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={async () => {
                const trimmed = renameValue.trim();
                if (trimmed && trimmed !== session.name) {
                  try {
                    await api.renameSession(sessionId!, trimmed);
                    useSessionStore.getState().upsertSession(sessionId!, { name: trimmed } as any);
                  } catch {}
                }
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setRenameValue(session.name); setRenaming(false); }
              }}
              className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 bg-transparent border-b border-blue-500 outline-none px-0 py-0 w-48"
            />
          ) : (
            <h2
              className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              onClick={() => { setRenameValue(session.name); setRenaming(true); }}
              title="Click to rename"
            >{session.name}</h2>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium shrink-0">{session.model}</span>

          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button onClick={async () => { if (session.status === 'busy' || loading) return; setLoading(true); try { await api.compactSession(sessionId!); } catch (e: any) { alert(e.message); } }}
              disabled={session.status === 'busy' || session.status === 'stopped' || loading}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all" title="Compact">
              {session.status === 'busy' && loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shrink className="w-3 h-3" />}
              <span className="hidden lg:inline">Compact</span>
            </button>
            <button onClick={toggleThinking}
              className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all',
                thinkingEnabled ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/30 text-violet-600 dark:text-violet-400'
                : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600')} title="Toggle thinking">
              <Brain className="w-3 h-3" /><span className="hidden lg:inline">{thinkingEnabled ? 'Thinking ON' : 'Think'}</span>
            </button>
            <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px]">
              <Cpu className="w-3 h-3 text-zinc-400" /><span className="font-mono text-zinc-500 tabular-nums">{formatTokens((session.inputTokens || 0) + (session.outputTokens || 0))}</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-[10px]">
              <Coins className="w-3 h-3 text-emerald-500" /><span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCost(session.costUsd || 0)}</span>
            </div>
            <button onClick={() => setShowSidebar(!showSidebar)} className={cn('p-1.5 rounded-lg transition-colors', showSidebar ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-500' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800')} title="Toggle panel">
              {showSidebar ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRight className="w-3.5 h-3.5" />}
            </button>
            {session.status !== 'stopped' && <button onClick={() => api.killSession(session.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-colors" title="Stop"><Square className="w-3.5 h-3.5" /></button>}
            <button onClick={async () => { if (!confirm(`Delete "${session.name}"?`)) return; try { wsClient.send({ type: 'session:unsubscribe', sessionId: session.id }); await api.deleteSession(session.id); useSessionStore.getState().removeSession(session.id); navigate('/'); } catch (err: any) { alert(`Failed to delete: ${err.message}`); } }} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {session.messages.length === 0 ? (
            /* ── Empty state with suggestions ── */
            <div className="flex h-full flex-col items-center justify-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 dark:from-blue-950/40 dark:to-violet-950/40 border border-blue-200 dark:border-blue-800/30 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-blue-500 dark:text-blue-400" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 mb-1">What can I help with?</h2>
              <p className="text-sm text-zinc-400 mb-6">Ask anything or try a suggestion</p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button key={s.title} onClick={() => doSend(s.prompt)}
                    className="group flex flex-col items-start gap-0.5 rounded-xl border border-zinc-200 dark:border-zinc-700 px-3.5 py-3 text-left transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-600">
                    <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200">{s.title}</span>
                    <span className="text-[11px] text-zinc-400 line-clamp-1">{s.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Message list ── */
            <div className="max-w-3xl mx-auto px-4 md:px-6 py-5 space-y-1">
              {session.messages.map((msg, idx) => (
                <div key={msg.id + idx}>
                  {msg.role === 'user' ? (
                    /* User turn */
                    <div className="flex gap-3 py-4">
                      <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-white text-[11px] font-bold">Y</span>
                      </div>
                      <div className="flex-1 min-w-0 group">
                        <div className="text-[11px] font-semibold text-zinc-400 mb-1">You</div>
                        {msg.blocks.map((block, i) => {
                          if (block.type === 'text') return <div key={i} className="text-[14px] text-zinc-900 dark:text-zinc-100 leading-relaxed whitespace-pre-wrap">{block.text}</div>;
                          if (block.type === 'tool_result') return <ToolResultBlock key={i} block={block} />;
                          return null;
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Assistant turn */
                    <div className="flex gap-3 py-4 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/20 -mx-3 px-3">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0 group">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-semibold text-zinc-400">Agent</span>
                          {/* Hover action bar */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyButton text={allText(msg)} />
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          {msg.blocks.map((block, i) => {
                            if (block.type === 'text') return (
                              <div key={i}
                                className="max-w-none"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(block.text) }}
                              />
                            );
                            if (block.type === 'thinking') return <ThinkingBlock key={i} text={block.text} />;
                            if (block.type === 'tool_use' && block.name === 'AskUserQuestion') return <AskUserQuestionCard key={i} block={block} onAnswer={doSend} />;
                            if (block.type === 'tool_use') return <ToolCallCard key={i} block={block} />;
                            if (block.type === 'tool_result') return <ToolResultBlock key={i} block={block} />;
                            return null;
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {session.status === 'busy' && (
                <div className="flex gap-3 py-4 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/20 -mx-3 px-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-zinc-400 mb-1.5">Agent</div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">{[0, 1, 2].map((i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                      <span className="text-[12px] text-zinc-400">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 md:px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
          <div className="max-w-3xl mx-auto relative">
            {/* Agent # menu */}
            {agentMenu.open && filteredAgents.length > 0 && (
              <div className="absolute bottom-full left-0 right-12 mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden z-20">
                <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Agents</span>
                </div>
                <div className="max-h-52 overflow-y-auto py-1">
                  {filteredAgents.map((agent, i) => (
                    <button
                      key={agent.name}
                      onClick={() => selectAgent(agent)}
                      onMouseEnter={() => setAgentMenu(m => ({ ...m, index: i }))}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        i === agentMenu.index
                          ? 'bg-blue-50 dark:bg-blue-950/30'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      )}
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                        i === agentMenu.index
                          ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/30'
                          : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700'
                      )}>
                        <Bot className={cn('w-4 h-4', i === agentMenu.index ? 'text-blue-500' : 'text-zinc-400')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-semibold', i === agentMenu.index ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-900 dark:text-zinc-100')}>
                            {agent.name}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400">{agent.model}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate">{agent.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="px-3 py-1.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                  <span className="text-[9px] text-zinc-400"><kbd className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-[8px] font-mono">↑↓</kbd> navigate <kbd className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-[8px] font-mono ml-1">↵</kbd> select <kbd className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-[8px] font-mono ml-1">esc</kbd> dismiss</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 items-end">
              <textarea ref={inputRef} value={input} onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder={session.status === 'stopped' ? 'Session stopped' : 'Message your agent... (# to mention an agent)'}
                disabled={session.status === 'stopped'} rows={1}
                className="flex-1 px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none disabled:opacity-40 transition-all leading-relaxed"
                style={{ minHeight: 46, maxHeight: 200 }} />
              <button onClick={handleSend} disabled={!input.trim() || session.status === 'stopped' || loading}
                className="h-[46px] w-[46px] shrink-0 rounded-2xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm hover:shadow-md active:scale-95 transition-all">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 mt-1.5 text-center">Enter to send &middot; Shift+Enter for new line &middot; # to mention an agent</p>
        </div>
      </div>

      {/* Right sidebar */}
      <SessionInfoSidebar session={session} open={showSidebar} onClose={() => setShowSidebar(false)} />
    </div>
  );
}
