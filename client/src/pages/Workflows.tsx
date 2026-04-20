import { useState, useEffect } from 'react';
import { Play, Plus, Trash2, Edit3, ArrowRight, Loader2, CheckCircle2, XCircle, Clock, Workflow } from 'lucide-react';
import { cn, formatCost, timeAgo } from '../lib/utils';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import WorkflowEditor from '../components/WorkflowEditor';

interface SavedWorkflow {
  id: string;
  name: string;
  description: string;
  color: string;
  steps: any[];
  isPreset: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function Workflows() {
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<SavedWorkflow | null>(null);
  const [runTarget, setRunTarget] = useState<SavedWorkflow | null>(null);
  const [runInput, setRunInput] = useState('');
  const [starting, setStarting] = useState(false);
  const navigate = useNavigate();

  const loadData = async () => {
    const [wfs, rs, ags] = await Promise.all([
      api.getWorkflows(),
      api.getWorkflowRuns(),
      api.getAgents().catch(() => []),
    ]);
    setWorkflows(wfs);
    setRuns(rs);
    setAgents(ags);
  };
  useEffect(() => { loadData(); }, []);

  const handleSave = async (data: any) => {
    try {
      if (editingWorkflow?.id) {
        await api.updateWorkflow(editingWorkflow.id, data);
      } else {
        await api.createWorkflow(data);
      }
      setShowEditor(false);
      setEditingWorkflow(null);
      await loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workflow?')) return;
    try {
      await api.deleteWorkflow(id);
      await loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleRun = async () => {
    if (!runTarget || !runInput.trim()) return;
    setStarting(true);
    try {
      const result = await api.runWorkflow(runTarget.id, runInput);
      setRunTarget(null);
      setRunInput('');
      navigate(`/workflows/runs/${result.runId}`);
    } catch (e: any) {
      alert(e.message);
    }
    setStarting(false);
  };

  const handleDeleteRun = async (id: string) => {
    if (!confirm('Delete this run?')) return;
    try {
      await api.deleteWorkflowRun(id);
      await loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Show editor
  if (showEditor) {
    return (
      <div className="space-y-8">
        <WorkflowEditor
          workflow={editingWorkflow || undefined}
          agents={agents}
          onSave={handleSave}
          onCancel={() => { setShowEditor(false); setEditingWorkflow(null); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Workflows</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Multi-step pipelines — each step feeds into the next</p>
        </div>
        <button onClick={() => { setEditingWorkflow(null); setShowEditor(true); }}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm transition-all">
          <Plus className="w-4 h-4" /> Create Workflow
        </button>
      </div>

      {/* Workflow cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workflows.map((wf) => (
          <div key={wf.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:shadow-lg transition-all group">
            <div className="h-1.5" style={{ backgroundColor: wf.color }} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">{wf.name}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{wf.description}</p>
                </div>
                {wf.isPreset && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 uppercase tracking-wider shrink-0">Preset</span>
                )}
              </div>

              {/* Step flow preview */}
              <div className="flex items-center gap-1.5 flex-wrap mb-4">
                {wf.steps.map((step: any, j: number) => (
                  <div key={step.id} className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                      <span className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[9px] font-bold">{j + 1}</span>
                      {step.name}
                    </span>
                    {j < wf.steps.length - 1 && <ArrowRight className="w-3 h-3 text-zinc-300 dark:text-zinc-600" />}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button onClick={() => { setRunTarget(runTarget?.id === wf.id ? null : wf); setRunInput(''); }}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold shadow-sm transition-all',
                    runTarget?.id === wf.id
                      ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}>
                  <Play className="w-3.5 h-3.5" /> {runTarget?.id === wf.id ? 'Cancel' : 'Run'}
                </button>
                <button onClick={() => { setEditingWorkflow(wf); setShowEditor(true); }}
                  className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-all">
                  <Edit3 className="w-4 h-4" />
                </button>
                {!wf.isPreset && (
                  <button onClick={() => handleDelete(wf.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Run input panel (inline) */}
            {runTarget?.id === wf.id && (
              <div className="px-5 pb-5 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                <textarea value={runInput} onChange={(e) => setRunInput(e.target.value)}
                  placeholder="Describe what you need..."
                  rows={3} autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none mb-3" />
                <button onClick={handleRun} disabled={!runInput.trim() || starting}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 shadow-sm transition-all">
                  {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {starting ? 'Starting...' : 'Start Workflow'}
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Create card */}
        <button onClick={() => { setEditingWorkflow(null); setShowEditor(true); }}
          className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/10 transition-all">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
            <Plus className="w-7 h-7 text-zinc-300 dark:text-zinc-600" />
          </div>
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Create Workflow</p>
          <p className="text-xs text-zinc-400 mt-1">Build a multi-step pipeline</p>
        </button>
      </div>

      {/* Recent Runs */}
      {runs.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Recent Runs</h2>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
            {runs.slice(0, 10).map((run) => (
              <div key={run.id}
                onClick={() => navigate(`/workflows/runs/${run.id}`)}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors group">
                {run.status === 'running' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
                {run.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                {run.status === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{run.name}</span>
                  <span className="text-xs text-zinc-400 ml-2">{run.steps?.length || 0} steps</span>
                </div>
                <span className="text-[10px] text-zinc-400">{timeAgo(run.startedAt)}</span>
                {run.totalCostUsd > 0 && <span className="text-[10px] font-mono text-emerald-600">{formatCost(run.totalCostUsd)}</span>}
                <button onClick={(e) => { e.stopPropagation(); handleDeleteRun(run.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
