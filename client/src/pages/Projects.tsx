import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useSessionStore } from '../stores/session-store';
import { FolderKanban, Plus, Trash2, ChevronRight, Palette, GripVertical, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn, timeAgo, formatCost } from '../lib/utils';
import { wsClient } from '../lib/ws';

const COLORS = [
  { value: '#3B82F6', name: 'Blue' },
  { value: '#10B981', name: 'Green' },
  { value: '#F59E0B', name: 'Amber' },
  { value: '#EF4444', name: 'Red' },
  { value: '#8B5CF6', name: 'Violet' },
  { value: '#EC4899', name: 'Pink' },
  { value: '#06B6D4', name: 'Cyan' },
  { value: '#84CC16', name: 'Lime' },
];

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', color: '#3B82F6' });
  const sessions = useSessionStore((s) => s.sessions);
  const { openTab } = useSessionStore();
  const navigate = useNavigate();

  const loadProjects = () => api.getProjects().then(setProjects);
  useEffect(() => { loadProjects(); }, []);

  const handleCreate = async () => {
    if (!newProject.name.trim()) return;
    await api.createProject(newProject.name, newProject.description, newProject.color);
    setNewProject({ name: '', description: '', color: '#3B82F6' });
    setShowCreate(false);
    loadProjects();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project? Sessions inside won\'t be deleted.')) return;
    try {
      await api.deleteProject(id);
      loadProjects();
    } catch (e: any) {
      alert(`Failed to delete project: ${e.message}`);
    }
  };

  const allAssigned = new Set(projects.flatMap((p) => p.sessionIds));
  const unassignedSessions = Object.values(sessions).filter((s) => !allAssigned.has(s.id));

  const handleDrop = async (projectId: string, sessionId: string) => {
    await api.addSessionToProject(projectId, sessionId);
    loadProjects();
  };

  return (
    <div className="space-y-8">
      {/* Header with explanation */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Projects</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Group related sessions together. A <strong className="text-zinc-700 dark:text-zinc-300">session</strong> is a single conversation with an agent. A <strong className="text-zinc-700 dark:text-zinc-300">project</strong> organizes multiple sessions by topic.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 hover:shadow-md active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          New Project
        </button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800/30 rounded-2xl p-6 shadow-lg shadow-blue-500/5">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-4">Create Project</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 block">Name</label>
              <input
                type="text"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                placeholder="e.g. Finance Tools, Trip Planner..."
                className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 flex items-center gap-1.5 block">
                System Prompt / Description
                <span className="text-[10px] font-normal text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded">used as system prompt</span>
              </label>
              <textarea
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                placeholder={"Define the agent's role and behavior for this project...\n\nExample:\nYou are a personal finance assistant. Help me track expenses, analyze spending patterns, create budgets, and plan savings goals. Always be specific with numbers and suggest actionable steps."}
                rows={5}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-y font-mono leading-relaxed"
              />
              <p className="text-[11px] text-zinc-400 mt-1.5">
                Supports markdown. This text is sent as the <strong>system prompt</strong> for all sessions created in this project.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1.5 block"><Palette className="w-3 h-3" /> Color</label>
              <div className="flex items-center gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setNewProject({ ...newProject, color: c.value })}
                    className={cn('w-8 h-8 rounded-full transition-all border-2', newProject.color === c.value ? 'scale-110 border-zinc-900 dark:border-zinc-100 shadow-md' : 'border-transparent hover:scale-105')}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={handleCreate} disabled={!newProject.name.trim()} className="h-10 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-all">Create Project</button>
            <button onClick={() => setShowCreate(false)} className="h-10 px-5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Projects grid */}
      {projects.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center py-20">
          <div className="w-20 h-20 rounded-3xl bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/30 flex items-center justify-center mb-5">
            <FolderKanban className="w-9 h-9 text-violet-300 dark:text-violet-700" />
          </div>
          <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">No projects yet</p>
          <p className="text-sm text-zinc-400 mt-1 max-w-sm text-center">Create a project to organize your sessions by topic — like "Finance", "Travel Planning", or "Code Reviews"</p>
          <button onClick={() => setShowCreate(true)} className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 transition-all">
            <Plus className="w-4 h-4" /> Create your first project
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const projectSessions = project.sessionIds.map((sid: string) => sessions[sid]).filter(Boolean);
            const totalCost = projectSessions.reduce((s: number, ses: any) => s + (ses?.costUsd || 0), 0);

            return (
              <div key={project.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                {/* Project header */}
                <div className="flex items-center gap-4 px-6 py-5">
                  <div className="w-4 h-4 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: project.color }} />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">{project.name}</h3>
                    {project.description && <p className="text-xs text-zinc-400 mt-0.5">{project.description}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <MessageSquare className="w-3 h-3" />
                      {project.sessionIds.length} session{project.sessionIds.length !== 1 ? 's' : ''}
                    </span>
                    {totalCost > 0 && <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCost(totalCost)}</span>}
                    <button onClick={() => handleDelete(project.id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sessions list */}
                {projectSessions.length > 0 && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800">
                    {projectSessions.map((s: any) => (
                      <div
                        key={s.id}
                        onClick={() => { openTab(s.id); wsClient.send({ type: 'session:subscribe', sessionId: s.id }); navigate(`/session/${s.id}`); }}
                        className="flex items-center gap-3 px-6 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer border-b border-zinc-50 dark:border-zinc-800/50 last:border-0 transition-colors"
                      >
                        <span className={cn('w-2 h-2 rounded-full shrink-0', s.status === 'idle' ? 'bg-emerald-400' : s.status === 'busy' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-300 dark:bg-zinc-600')} />
                        <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate">{s.name}</span>
                        <span className="text-xs text-zinc-400">{s.model}</span>
                        <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{formatCost(s.costUsd || 0)}</span>
                        <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Drop zone */}
                <div
                  className="px-6 py-3 bg-zinc-50 dark:bg-zinc-800/30 text-center text-xs text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-blue-50', 'dark:bg-blue-950/20', 'text-blue-500'); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('bg-blue-50', 'dark:bg-blue-950/20', 'text-blue-500'); }}
                  onDrop={(e) => { e.currentTarget.classList.remove('bg-blue-50', 'dark:bg-blue-950/20', 'text-blue-500'); const sid = e.dataTransfer.getData('sessionId'); if (sid) handleDrop(project.id, sid); }}
                >
                  Drag sessions here to add
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned sessions */}
      {unassignedSessions.length > 0 && projects.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">
            Unassigned Sessions ({unassignedSessions.length})
          </h3>
          <p className="text-xs text-zinc-400 mb-3">Drag a session onto a project above to organize it</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unassignedSessions.map((s) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('sessionId', s.id)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-grab hover:shadow-sm active:cursor-grabbing transition-all"
              >
                <GripVertical className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0" />
                <span className={cn('w-2 h-2 rounded-full shrink-0', s.status === 'idle' ? 'bg-emerald-400' : s.status === 'busy' ? 'bg-amber-400' : 'bg-zinc-300')} />
                <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate">{s.name}</span>
                <span className="text-xs text-zinc-400">{s.model}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
