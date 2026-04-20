import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { wsClient } from '../lib/ws';
import { useSessionStore, ParsedMessage, ContentBlock } from '../stores/session-store';
import { api } from '../lib/api';
import { cn, formatCost } from '../lib/utils';
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, Clock, Play, ArrowDown,
  Bot, Coins, Send, ChevronRight, ChevronDown, Terminal, FileText, Edit3,
  Search, Globe, Wrench, Brain, FileCode, FolderSearch, Sparkles
} from 'lucide-react';
import { renderMarkdown } from '../lib/markdown';

const STEP_COMPLETE_MARKER = '[STEP_COMPLETE]';

// ── Inline rendering components (same as SessionView) ───────────────────────

const TOOL_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  Bash:      { icon: Terminal, label: 'Terminal', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  Read:      { icon: FileText, label: 'Read File', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  Edit:      { icon: Edit3, label: 'Edit', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  Write:     { icon: FileCode, label: 'Write', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  Grep:      { icon: Search, label: 'Search', color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950/30' },
  Glob:      { icon: FolderSearch, label: 'Find Files', color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30' },
  WebFetch:  { icon: Globe, label: 'Fetch', color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-950/30' },
  WebSearch: { icon: Globe, label: 'Web Search', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30' },
  Agent:     { icon: Brain, label: 'Sub-Agent', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30' },
};

function ToolCard({ block }: { block: any }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[block.name] || { icon: Wrench, label: block.name, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' };
  const Icon = meta.icon;
  const summary = block.name === 'Bash' ? block.input?.command?.slice(0, 80) :
    (block.input?.file_path || block.input?.pattern || block.input?.description || '');

  return (
    <div className="my-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700/60 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
        <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0', meta.bg)}>
          <Icon className={cn('w-2.5 h-2.5', meta.color)} />
        </div>
        <span className={cn('text-[11px] font-semibold shrink-0', meta.color)}>{meta.label}</span>
        <span className="text-[10px] text-zinc-400 truncate flex-1 font-mono">{summary}</span>
        <span className={cn(
          'shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase',
          block.status === 'pending' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' :
          block.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' :
          'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
        )}>{block.status === 'pending' ? 'running' : block.status}</span>
      </button>
      {open && block.result && (
        <div className="px-3 pb-2 border-t border-zinc-100 dark:border-zinc-700/40">
          <pre className="text-[10px] font-mono text-zinc-500 max-h-32 overflow-auto mt-1.5 whitespace-pre-wrap">{block.result.length > 400 ? block.result.slice(0, 400) + '...' : block.result}</pre>
        </div>
      )}
    </div>
  );
}

function ThinkingIndicator({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1 rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/30">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px]">
        <Brain className="w-3 h-3 text-amber-500" />
        <span className="text-zinc-500">{open ? 'Hide reasoning' : 'Reasoning'}</span>
        <ChevronDown className={cn('ml-auto w-3 h-3 text-zinc-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-zinc-200 dark:border-zinc-700/40 px-3 py-2 text-[11px] text-zinc-400 italic max-h-40 overflow-auto whitespace-pre-wrap">{text}</div>}
    </div>
  );
}

function renderBlocks(blocks: ContentBlock[]) {
  return blocks.map((block, i) => {
    if (block.type === 'text') {
      // Strip STEP_COMPLETE markers and step_output tags from display
      let text = block.text
        .replace(/\[STEP_COMPLETE\]/g, '')
        .replace(/<step_output>[\s\S]*?<\/step_output>/g, '')
        .trim();
      if (!text) return null;
      return <div key={i} className="max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
    }
    if (block.type === 'thinking') return <ThinkingIndicator key={i} text={block.text} />;
    if (block.type === 'tool_use') return <ToolCard key={i} block={block} />;
    return null;
  });
}

// ── Main component ──────────────────────────────────────────────────────────

export default function WorkflowRunView() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [stepInputs, setStepInputs] = useState<Record<string, string>>({});
  const [sendingStep, setSendingStep] = useState<string | null>(null);
  const [completingStep, setCompletingStep] = useState<string | null>(null);
  const initedRef = useRef(false);
  const autoCompletedRef = useRef(new Set<string>());
  const subscribedSessions = useRef(new Set<string>());

  // Access session store for step session messages
  const sessions = useSessionStore(s => s.sessions);
  const upsertSession = useSessionStore(s => s.upsertSession);

  // Fetch initial state + subscribe to WS
  useEffect(() => {
    if (!runId || initedRef.current) return;
    initedRef.current = true;

    api.getWorkflowRun(runId).then(setRun).catch(() => {});
    wsClient.send({ type: 'workflow:subscribe', runId } as any);

    const unsub = wsClient.subscribe((msg: any) => {
      if (msg.type === 'workflow:update' && msg.run?.id === runId) {
        setRun(msg.run);
      }
    });

    return () => {
      unsub();
      wsClient.send({ type: 'workflow:unsubscribe', runId } as any);
    };
  }, [runId]);

  // Register step sessions in the Zustand store and load their history
  const appendEvent = useSessionStore(s => s.appendEvent);
  useEffect(() => {
    if (!run?.stepResults) return;
    for (const step of run.steps) {
      const result = run.stepResults[step.id];
      if (result?.sessionId && !subscribedSessions.current.has(result.sessionId)) {
        subscribedSessions.current.add(result.sessionId);
        // Create a skeleton session entry so appendEvent can process events
        upsertSession(result.sessionId, {
          id: result.sessionId,
          name: step.name,
          messages: [],
          status: result.status === 'active' ? 'busy' : 'idle',
          model: step.model || 'sonnet',
          provider: 'claude',
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          projectId: run.projectId,
          createdAt: new Date().toISOString(),
          tags: ['workflow'],
        } as any);

        // Load conversation history from disk (catches events missed during page refresh)
        api.getConversation(result.sessionId)
          .then(events => events.forEach(e => appendEvent(result.sessionId, e)))
          .catch(() => {});

        // Subscribe to live session events
        wsClient.send({ type: 'session:subscribe', sessionId: result.sessionId });
      }
    }
  }, [run?.stepResults]);

  useEffect(() => {
    return () => {
      subscribedSessions.current.forEach(sid =>
        wsClient.send({ type: 'session:unsubscribe', sessionId: sid })
      );
    };
  }, []);

  // Auto-complete steps when [STEP_COMPLETE] is detected in session messages
  useEffect(() => {
    if (!run) return;
    for (const step of run.steps) {
      const result = run.stepResults[step.id];
      if (result?.status !== 'active' || !result.sessionId) continue;
      if (autoCompletedRef.current.has(step.id)) continue;

      const session = sessions[result.sessionId];
      if (!session?.messages) continue;

      for (const msg of session.messages) {
        if (msg.role !== 'assistant') continue;
        for (const block of msg.blocks) {
          if (block.type === 'text' && block.text?.includes(STEP_COMPLETE_MARKER)) {
            autoCompletedRef.current.add(step.id);
            handleCompleteStep(step.id);
            return;
          }
        }
      }
    }
  }, [sessions, run]);

  const handleSendToStep = async (stepId: string) => {
    if (!run) return;
    const result = run.stepResults[stepId];
    if (!result?.sessionId) return;
    const text = stepInputs[stepId]?.trim();
    if (!text) return;

    setSendingStep(stepId);
    setStepInputs(prev => ({ ...prev, [stepId]: '' }));

    // Optimistic user message
    useSessionStore.setState((state) => {
      const session = state.sessions[result.sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [result.sessionId]: {
            ...session,
            messages: [...session.messages, {
              id: crypto.randomUUID(),
              role: 'user' as const,
              blocks: [{ type: 'text' as const, text }],
              timestamp: new Date().toISOString(),
            }],
            status: 'busy',
          },
        },
      };
    });

    try {
      await api.sendMessage(result.sessionId, text);
    } catch (e: any) {
      console.error(e);
    }
    setSendingStep(null);
  };

  const handleCompleteStep = async (stepId: string) => {
    if (!runId) return;
    setCompletingStep(stepId);
    try {
      await api.completeWorkflowStep(runId, stepId);
    } catch (e: any) {
      console.error(e);
    }
    setCompletingStep(null);
  };

  if (!run) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-zinc-300 animate-spin" />
      </div>
    );
  }

  const elapsed = run.completedAt
    ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
    : Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
        <button onClick={() => navigate('/workflows')} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{run.name}</h2>
        {run.status === 'running' && <span className="flex items-center gap-1.5 text-[11px] text-blue-600 font-semibold bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 rounded-full"><Loader2 className="w-3 h-3 animate-spin" /> In Progress</span>}
        {run.status === 'completed' && <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-semibold bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full"><CheckCircle2 className="w-3 h-3" /> Completed</span>}
        {run.status === 'error' && <span className="flex items-center gap-1.5 text-[11px] text-red-600 font-semibold bg-red-50 dark:bg-red-950/30 px-2.5 py-1 rounded-full"><XCircle className="w-3 h-3" /> Error</span>}
        <div className="flex-1" />
        <span className="text-[11px] text-zinc-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {elapsed}s</span>
        {run.totalCostUsd > 0 && <span className="text-[11px] font-mono text-emerald-600 flex items-center gap-1"><Coins className="w-3 h-3" /> {formatCost(run.totalCostUsd)}</span>}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Step tracker sidebar */}
        <div className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Steps</span>
          </div>
          {run.steps.map((step: any, i: number) => {
            const result = run.stepResults?.[step.id];
            const status = result?.status || 'pending';
            return (
              <button key={step.id}
                onClick={() => document.getElementById(`step-${step.id}`)?.scrollIntoView({ behavior: 'smooth' })}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left border-b border-zinc-50 dark:border-zinc-800/50 transition-colors',
                  status === 'active' ? 'bg-blue-50 dark:bg-blue-950/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                )}>
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                  status === 'pending' && 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400',
                  status === 'active' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 ring-2 ring-blue-400/30',
                  status === 'done' && 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
                  status === 'error' && 'bg-red-100 dark:bg-red-900/30 text-red-600',
                )}>
                  {status === 'active' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                   status === 'done' ? <CheckCircle2 className="w-4 h-4" /> :
                   status === 'error' ? <XCircle className="w-4 h-4" /> :
                   i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn('text-sm font-medium truncate', status === 'active' ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-900 dark:text-zinc-100')}>{step.name}</div>
                  <span className="text-[9px] text-zinc-400">{step.model}</span>
                  {result?.costUsd > 0 && <span className="text-[9px] font-mono text-emerald-500 ml-2">{formatCost(result.costUsd)}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Main output area */}
        <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 p-6">
          <div className="max-w-4xl mx-auto space-y-2">
            {/* Input card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                <span className="text-xs font-bold text-zinc-500">Input</span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{run.input}</p>
              </div>
            </div>

            {/* Step panels */}
            {run.steps.map((step: any, i: number) => {
              const result = run.stepResults?.[step.id];
              const status = result?.status || 'pending';
              const isActive = status === 'active';
              const sessionId = result?.sessionId;
              const session = sessionId ? sessions[sessionId] : null;
              const messages = session?.messages || [];
              const isBusy = session?.status === 'busy';

              return (
                <div key={step.id}>
                  {/* Connector */}
                  <div className="flex items-center justify-center py-1">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                      <ArrowDown className="w-3 h-3 text-zinc-400" />
                      <span className="text-[10px] font-medium text-zinc-500">
                        {i === 0 ? 'Input fed into Step 1' : `Output fed into ${step.name}`}
                      </span>
                    </div>
                  </div>

                  {/* Step panel */}
                  <div id={`step-${step.id}`} className={cn(
                    'bg-white dark:bg-zinc-900 border rounded-2xl overflow-hidden transition-all',
                    isActive ? 'border-blue-300 dark:border-blue-700/50 shadow-md shadow-blue-500/5' :
                    status === 'done' ? 'border-emerald-200 dark:border-emerald-800/30' :
                    status === 'error' ? 'border-red-300 dark:border-red-700/50' :
                    'border-zinc-200 dark:border-zinc-800'
                  )}>
                    {/* Header */}
                    <div className={cn(
                      'flex items-center gap-3 px-5 py-3 border-b',
                      isActive ? 'border-blue-100 dark:border-blue-800/30 bg-blue-50/50 dark:bg-blue-950/20' :
                      status === 'done' ? 'border-emerald-100 dark:border-emerald-800/20 bg-emerald-50/30 dark:bg-emerald-950/10' :
                      'border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30'
                    )}>
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                        status === 'pending' && 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400',
                        status === 'active' && 'bg-blue-200 dark:bg-blue-800/50 text-blue-600',
                        status === 'done' && 'bg-emerald-200 dark:bg-emerald-800/50 text-emerald-600',
                        status === 'error' && 'bg-red-200 dark:bg-red-800/50 text-red-600',
                      )}>
                        {status === 'active' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                         status === 'done' ? <CheckCircle2 className="w-3 h-3" /> :
                         status === 'error' ? <XCircle className="w-3 h-3" /> :
                         i + 1}
                      </div>
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{step.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">{step.model}</span>
                      {step.agent && <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-600 font-medium flex items-center gap-1"><Bot className="w-2.5 h-2.5" /> {step.agent}</span>}
                      <div className="flex-1" />
                      {isActive && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold animate-pulse">Active</span>}
                      {result?.costUsd > 0 && <span className="text-[10px] font-mono text-emerald-600">{formatCost(result.costUsd)}</span>}
                    </div>

                    {/* Session messages — rendered same as SessionView */}
                    <div className="px-5 py-4 space-y-3">
                      {status === 'pending' && (
                        <p className="text-sm text-zinc-400 italic">Waiting for previous steps...</p>
                      )}

                      {messages.map((msg, mi) => (
                        <div key={msg.id + mi}>
                          {msg.role === 'user' ? (
                            <div className="flex gap-3 py-2">
                              <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                                <span className="text-white text-[9px] font-bold">Y</span>
                              </div>
                              <div className="flex-1">
                                {msg.blocks.map((block, bi) =>
                                  block.type === 'text' ? <div key={bi} className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">{block.text}</div> : null
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-3 py-2">
                              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0">
                                <Sparkles className="w-3 h-3 text-white" />
                              </div>
                              <div className="flex-1 min-w-0 space-y-0.5">
                                {renderBlocks(msg.blocks)}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Busy indicator */}
                      {isActive && isBusy && messages.length > 0 && (
                        <div className="flex gap-3 py-2">
                          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0">
                            <Sparkles className="w-3 h-3 text-white" />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">{[0, 1, 2].map(j => <div key={j} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />)}</div>
                            <span className="text-[12px] text-zinc-400">Thinking...</span>
                          </div>
                        </div>
                      )}

                      {/* Show persisted result text for completed steps with no live messages */}
                      {status === 'done' && messages.length === 0 && result?.text && (
                        <div className="max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.text) }} />
                      )}

                      {status === 'error' && result?.text && (
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
                          <p className="text-sm text-red-600">{result.text}</p>
                        </div>
                      )}
                    </div>

                    {/* Interactive input + complete button (active steps only) */}
                    {isActive && (
                      <div className="px-5 pb-4 space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                        <div className="flex gap-2 items-end">
                          <textarea
                            value={stepInputs[step.id] || ''}
                            onChange={(e) => setStepInputs(prev => ({ ...prev, [step.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendToStep(step.id); } }}
                            placeholder="Reply to this step..."
                            rows={1}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                            style={{ minHeight: 40, maxHeight: 120 }}
                          />
                          <button onClick={() => handleSendToStep(step.id)}
                            disabled={!stepInputs[step.id]?.trim() || sendingStep === step.id}
                            className="h-10 w-10 shrink-0 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-30 shadow-sm">
                            {sendingStep === step.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleCompleteStep(step.id)}
                            disabled={completingStep === step.id}
                            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40 shadow-sm transition-all">
                            {completingStep === step.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            Complete Step & Continue
                          </button>
                          <span className="text-[10px] text-zinc-400">Agent signals [STEP_COMPLETE] when ready, or advance manually</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
