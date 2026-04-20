import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/session-store';
import { api } from '../lib/api';
import { wsClient } from '../lib/ws';
import { cn, formatCost, timeAgo } from '../lib/utils';
import { Plus, Square, Trash2, Bot, Zap, ArrowRight, ChevronDown, Sparkles, Clock, DollarSign, MessageSquare, FolderKanban } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { sessions, openTab, upsertSession, removeSession } = useSessionStore();
  const [providers, setProviders] = useState<any>({});
  const [creating, setCreating] = useState(false);
  const [newSession, setNewSession] = useState({ name: '', model: 'sonnet', prompt: '', systemPrompt: '', projectId: '' });
  const [templates, setTemplates] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  useEffect(() => {
    api.getProviders().then(setProviders);
    api.getTemplates().then(setTemplates);
    api.getAgents().then(setAgents).catch(() => {});
    api.getProjects().then(setProjects);
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const project = await api.createProject(newProjectName);
    setProjects([...projects, project]);
    setNewSession({ ...newSession, projectId: project.id });
    setNewProjectName('');
    setShowCreateProject(false);
  };

  const sessionList = Object.values(sessions).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleCreate = async () => {
    if (!newSession.name.trim()) return;
    if (!newSession.projectId) { alert('Please select a project first'); return; }
    setCreating(true);
    try {
      const session = await api.createSession({ name: newSession.name, model: newSession.model, projectId: newSession.projectId, systemPrompt: newSession.systemPrompt || undefined, initialPrompt: newSession.prompt || undefined, permissionMode: 'auto' });
      upsertSession(session.id, { ...session, messages: [], provider: session.providerId });
      openTab(session.id);
      wsClient.send({ type: 'session:subscribe', sessionId: session.id });
      if (newSession.projectId) await api.addSessionToProject(newSession.projectId, session.id);
      navigate(`/session/${session.id}`);
    } catch (e: any) { alert(e.message); }
    setCreating(false);
  };

  const handleCreateFromTemplate = async (template: any) => {
    if (!newSession.projectId && projects.length > 0) {
      alert('Please select a project in the New Session section first');
      return;
    }
    setCreating(true);
    try {
      const session = await api.createSession({ name: template.name, model: 'sonnet', projectId: newSession.projectId || undefined, systemPrompt: template.content, permissionMode: 'auto' });
      upsertSession(session.id, { ...session, messages: [], provider: session.providerId });
      openTab(session.id);
      wsClient.send({ type: 'session:subscribe', sessionId: session.id });
      if (newSession.projectId) await api.addSessionToProject(newSession.projectId, session.id);
      navigate(`/session/${session.id}`);
    } catch (e: any) { alert(e.message); }
    setCreating(false);
  };

  const totalCost = sessionList.reduce((s, ses) => s + (ses.costUsd || 0), 0);
  const activeSessions = sessionList.filter((s) => s.status === 'busy' || s.status === 'idle').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Home</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Your personal assistant hub</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Sessions', value: sessionList.length, icon: MessageSquare, iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600 dark:text-blue-400' },
          { label: 'Active Now', value: activeSessions, icon: Zap, iconBg: 'bg-amber-100 dark:bg-amber-900/30', iconColor: 'text-amber-600 dark:text-amber-400' },
          { label: 'Total Cost', value: formatCost(totalCost), icon: DollarSign, iconBg: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Templates', value: templates.length, icon: Bot, iconBg: 'bg-violet-100 dark:bg-violet-900/30', iconColor: 'text-violet-600 dark:text-violet-400' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{stat.label}</span>
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', stat.iconBg)}>
                <stat.icon className={cn('w-4 h-4', stat.iconColor)} />
              </div>
            </div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* New Session */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-md">
              <Sparkles className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Start a Conversation</h2>
              <p className="text-xs text-zinc-400">Get help with anything — planning, research, decisions, and more</p>
            </div>
          </div>

          {/* Project selector */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1.5 block">
              <FolderKanban className="w-3 h-3" /> Project <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <select
                value={newSession.projectId}
                onChange={(e) => setNewSession({ ...newSession, projectId: e.target.value })}
                className={cn("flex-1 h-11 px-4 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all cursor-pointer",
                  newSession.projectId ? 'border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100' : 'border-amber-300 dark:border-amber-700 text-zinc-400'
                )}
              >
                <option value="">Select a project...</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={() => setShowCreateProject(!showCreateProject)}
                className="h-11 px-4 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 text-sm font-medium text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> New Project
              </button>
            </div>
            {showCreateProject && (
              <div className="flex gap-2 mt-2">
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name..."
                  className="flex-1 h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                  autoFocus
                />
                <button onClick={handleCreateProject} disabled={!newProjectName.trim()} className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-all">Create</button>
              </div>
            )}
            {!newSession.projectId && projects.length === 0 && (
              <p className="text-xs text-amber-500 mt-1.5 flex items-center gap-1">
                Create a project first to organize your sessions
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3 mb-4">
            <input
              type="text"
              value={newSession.name}
              onChange={(e) => setNewSession({ ...newSession, name: e.target.value })}
              placeholder="Session name..."
              className="h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleCreate()}
            />
            <select
              value={newSession.model}
              onChange={(e) => setNewSession({ ...newSession, model: e.target.value })}
              className="h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all cursor-pointer"
            >
              {providers.claude?.models?.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Agent selector */}
          {agents.length > 0 && (
            <div className="mb-4">
              <select
                onChange={(e) => {
                  const agent = agents.find((a: any) => a.name === e.target.value);
                  if (agent) {
                    setNewSession({ ...newSession, name: agent.name, model: agent.model, systemPrompt: agent.systemPrompt });
                  } else {
                    setNewSession({ ...newSession, systemPrompt: '' });
                  }
                }}
                className="h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer w-full"
              >
                <option value="">Use an agent (optional)...</option>
                {agents.map((a: any) => (
                  <option key={a.name} value={a.name}>{a.name} — {a.description}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mb-3 transition-colors"
          >
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showAdvanced && 'rotate-180')} />
            Advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-3 mb-4">
              <textarea
                value={newSession.systemPrompt}
                onChange={(e) => setNewSession({ ...newSession, systemPrompt: e.target.value })}
                placeholder="System prompt (define agent persona)..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none transition-all"
              />
              <textarea
                value={newSession.prompt}
                onChange={(e) => setNewSession({ ...newSession, prompt: e.target.value })}
                placeholder="Initial prompt (sent immediately after creation)..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none transition-all"
              />
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={!newSession.name.trim() || creating}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 hover:shadow-md active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            {creating ? 'Starting...' : 'Start Chat'}
          </button>
        </div>
      </div>

      {/* Quick Start */}
      {templates.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Quick Start</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleCreateFromTemplate(t)}
                disabled={creating}
                className="group p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 text-left transition-all hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                    <Bot className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{t.name}</div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 line-clamp-2 leading-relaxed">{t.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Session List */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">All Sessions</h2>
        {sessionList.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
            </div>
            <p className="text-sm font-medium text-zinc-500">No sessions yet</p>
            <p className="text-xs text-zinc-400 mt-1">Create one above to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessionList.map((session) => (
              <div
                key={session.id}
                onClick={() => { openTab(session.id); wsClient.send({ type: 'session:subscribe', sessionId: session.id }); navigate(`/session/${session.id}`); }}
                className="flex items-center gap-4 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-all hover:shadow-sm group"
              >
                <div className="relative shrink-0">
                  <div className={cn('w-3 h-3 rounded-full', session.status === 'busy' ? 'bg-amber-400' : session.status === 'idle' ? 'bg-emerald-400' : session.status === 'error' ? 'bg-red-400' : 'bg-zinc-300 dark:bg-zinc-600')} />
                  {session.status === 'busy' && <div className="absolute inset-0 w-3 h-3 rounded-full bg-amber-400 animate-ping opacity-50" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">{session.name}</span>
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">{session.model}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[11px] text-zinc-400"><Clock className="w-3 h-3" />{timeAgo(session.createdAt)}</span>
                    <span className="text-[11px] text-zinc-400 capitalize">{session.status}</span>
                  </div>
                </div>
                <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCost(session.costUsd || 0)}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {session.status !== 'stopped' && (
                    <button onClick={(e) => { e.stopPropagation(); api.killSession(session.id); }} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-colors" title="Stop">
                      <Square className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={async (e) => { e.stopPropagation(); if (!confirm(`Delete "${session.name}"?`)) return; try { await api.deleteSession(session.id); removeSession(session.id); } catch (err: any) { alert(`Failed to delete: ${err.message}`); } }} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-colors" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
