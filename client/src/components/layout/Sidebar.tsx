import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useUIStore } from '../../stores/ui-store';
import { useSessionStore } from '../../stores/session-store';
import { api } from '../../lib/api';
import { wsClient } from '../../lib/ws';
import { cn, formatCost } from '../../lib/utils';
import {
  LayoutDashboard, FolderKanban, Puzzle,
  Bot, Settings, PanelLeftClose, PanelLeft, Plus, X, Workflow, Sparkles, ChevronDown, ChevronRight
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/agents', icon: Bot, label: 'Assistants' },
  { to: '/workflows', icon: Workflow, label: 'Workflows' },
  { to: '/mcps', icon: Puzzle, label: 'Plugins' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { openTabs, activeSessionId, sessions, setActiveSession, closeTab, openTab } = useSessionStore();
  const navigate = useNavigate();
  const location = useLocation();
  const collapsed = !sidebarOpen;
  const [projects, setProjects] = useState<any[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<any[]>([]);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.getProjects().then(setProjects);
    api.getWorkflowRuns().then(setWorkflowRuns).catch(() => {});
    const interval = setInterval(() => {
      api.getProjects().then(setProjects);
      api.getWorkflowRuns().then(setWorkflowRuns).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleProjectCollapse = (id: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter out workflow step sessions — they show in the Workflows section instead
  const sessionList = Object.values(sessions).filter((s: any) => !s.tags?.includes('workflow'));

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col z-30 transition-all duration-200 ease-in-out',
        collapsed ? 'w-[68px]' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 shrink-0">
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center w-full')}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-md shrink-0">
            <Sparkles className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          {!collapsed && <span className="font-bold text-base tracking-tight text-zinc-900 dark:text-zinc-100">MyAgents</span>}
        </div>
        <button
          onClick={toggleSidebar}
          className={cn('p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors', collapsed ? 'hidden' : 'ml-auto')}
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {collapsed && (
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-4 w-6 h-6 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors z-40"
        >
          <PanelLeft className="w-3 h-3 text-zinc-500" />
        </button>
      )}

      <div className="h-px bg-zinc-100 dark:bg-zinc-800 mx-3" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all',
                collapsed ? 'justify-center w-10 h-10 mx-auto' : 'mx-3 px-3 py-2.5',
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200'
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
            {!collapsed && label}
          </NavLink>
        ))}

        {/* Active Workflow Runs */}
        {workflowRuns.length > 0 && !collapsed && (
          <>
            <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-3 mx-4" />
            <div className="px-5 mb-2">
              <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Workflows</span>
            </div>
            <div className="space-y-0.5">
              {workflowRuns.slice(0, 5).map((run: any) => {
                const isActive = location.pathname === `/workflows/runs/${run.id}`;
                return (
                  <div
                    key={run.id}
                    onClick={() => navigate(`/workflows/runs/${run.id}`)}
                    className={cn(
                      'flex items-center gap-2 cursor-pointer mx-3 px-2.5 py-1.5 rounded-lg transition-colors',
                      isActive ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    )}
                  >
                    <Workflow className={cn('w-3.5 h-3.5 shrink-0',
                      run.status === 'running' ? 'text-blue-500 animate-pulse' :
                      run.status === 'completed' ? 'text-emerald-500' :
                      'text-red-500'
                    )} />
                    <span className={cn('text-[12px] truncate flex-1', isActive ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-zinc-600 dark:text-zinc-400')}>{run.name}</span>
                    {run.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Sessions grouped by project */}
        {sessionList.length > 0 && !collapsed && (
          <>
            <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-3 mx-4" />
            <div className="px-5 mb-2">
              <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                Sessions
              </span>
            </div>
            <div className="space-y-0.5">
              {projects.map((project) => {
                const projectSessions = sessionList.filter((s) => s.projectId === project.id);
                if (projectSessions.length === 0) return null;
                const isCollapsed = collapsedProjects[project.id];

                return (
                  <div key={project.id}>
                    {/* Project header */}
                    <button
                      onClick={() => toggleProjectCollapse(project.id)}
                      className="flex items-center gap-2 w-full mx-3 px-2 py-1.5 rounded-lg text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      style={{ width: 'calc(100% - 24px)' }}
                    >
                      {isCollapsed
                        ? <ChevronRight className="w-3 h-3 text-zinc-400 shrink-0" />
                        : <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                      }
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                      <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 truncate flex-1">{project.name}</span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">{projectSessions.length}</span>
                    </button>

                    {/* Sessions under this project */}
                    {!isCollapsed && projectSessions.map((session) => {
                      const isActive = activeSessionId === session.id;
                      const isOpen = openTabs.includes(session.id);
                      return (
                        <div
                          key={session.id}
                          onClick={() => {
                            openTab(session.id);
                            setActiveSession(session.id);
                            wsClient.send({ type: 'session:subscribe', sessionId: session.id });
                            navigate(`/session/${session.id}`);
                          }}
                          className={cn(
                            'flex items-center gap-2 cursor-pointer group transition-all ml-7 mr-3 px-2.5 py-1.5 rounded-lg',
                            isActive
                              ? 'bg-blue-50 dark:bg-blue-950/30'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                          )}
                        >
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              session.status === 'busy' ? 'bg-amber-400 animate-pulse' :
                              session.status === 'idle' ? 'bg-emerald-400' :
                              session.status === 'error' ? 'bg-red-400' :
                              'bg-zinc-300 dark:bg-zinc-600'
                            )}
                          />
                          <span className={cn('text-[12px] truncate flex-1', isActive ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-zinc-600 dark:text-zinc-400')}>{session.name}</span>
                          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">{formatCost(session.costUsd || 0)}</span>
                          {isOpen && (
                            <button
                              onClick={(e) => { e.stopPropagation(); closeTab(session.id); }}
                              className="hidden group-hover:flex p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Ungrouped sessions (no projectId) */}
              {sessionList.filter((s) => !s.projectId).length > 0 && (
                <div>
                  <div className="mx-3 px-2 py-1.5">
                    <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">Ungrouped</span>
                  </div>
                  {sessionList.filter((s) => !s.projectId).map((session) => {
                    const isActive = activeSessionId === session.id;
                    return (
                      <div
                        key={session.id}
                        onClick={() => {
                          openTab(session.id);
                          setActiveSession(session.id);
                          wsClient.send({ type: 'session:subscribe', sessionId: session.id });
                          navigate(`/session/${session.id}`);
                        }}
                        className={cn(
                          'flex items-center gap-2 cursor-pointer group transition-all mx-3 px-2.5 py-1.5 rounded-lg ml-5',
                          isActive ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', session.status === 'idle' ? 'bg-emerald-400' : session.status === 'busy' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-300 dark:bg-zinc-600')} />
                        <span className={cn('text-[12px] truncate flex-1', isActive ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-zinc-600 dark:text-zinc-400')}>{session.name}</span>
                        <span className="text-[10px] font-mono text-zinc-400 tabular-nums">{formatCost(session.costUsd || 0)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Collapsed mode: just show status dots for open tabs */}
        {sessionList.length > 0 && collapsed && (
          <>
            <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-3 mx-3" />
            {openTabs.map((id) => {
              const session = sessions[id];
              if (!session) return null;
              return (
                <div
                  key={id}
                  onClick={() => { setActiveSession(id); navigate(`/session/${id}`); }}
                  className={cn(
                    'flex items-center justify-center w-10 h-10 mx-auto rounded-lg cursor-pointer',
                    activeSessionId === id ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  )}
                  title={session.name}
                >
                  <span className={cn('w-2 h-2 rounded-full', session.status === 'busy' ? 'bg-amber-400 animate-pulse' : session.status === 'idle' ? 'bg-emerald-400' : 'bg-zinc-300 dark:bg-zinc-600')} />
                </div>
              );
            })}
          </>
        )}
      </nav>

      {/* New Session */}
      <div className="p-3 shrink-0">
        <button
          onClick={() => navigate('/')}
          className={cn(
            'flex items-center justify-center gap-2 w-full rounded-xl text-[13px] font-semibold transition-all',
            'bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow-md active:scale-[0.98]',
            collapsed ? 'h-10 w-10 mx-auto rounded-lg' : 'py-2.5'
          )}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          {!collapsed && 'New Session'}
        </button>
      </div>
    </aside>
  );
}
