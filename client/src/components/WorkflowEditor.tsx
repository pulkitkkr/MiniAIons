import { useState } from 'react';
import { cn } from '../lib/utils';
import { Plus, Trash2, ArrowDown, Save, X } from 'lucide-react';

interface StepDef {
  id: string;
  name: string;
  prompt: string;
  model: string;
  dependsOn: string[];
  agent?: string;
}

interface WorkflowEditorProps {
  workflow?: { id?: string; name: string; description: string; color: string; steps: StepDef[]; isPreset?: boolean };
  agents: any[];
  onSave: (data: { name: string; description: string; color: string; steps: StepDef[]; isPreset: boolean }) => void;
  onCancel: () => void;
}

const COLORS = ['#3B82F6', '#06B6D4', '#10B981', '#EC4899', '#8B5CF6', '#F59E0B'];

export default function WorkflowEditor({ workflow, agents, onSave, onCancel }: WorkflowEditorProps) {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [color, setColor] = useState(workflow?.color || '#3B82F6');
  const [steps, setSteps] = useState<StepDef[]>(
    workflow?.steps || [{ id: '1', name: 'Step 1', prompt: '{{input}}', model: 'sonnet', dependsOn: [] }]
  );

  const addStep = () => {
    const newId = String(steps.length + 1);
    const prevId = steps[steps.length - 1]?.id;
    setSteps([...steps, {
      id: newId,
      name: `Step ${newId}`,
      prompt: prevId ? `{{step_${prevId}_output}}` : '{{input}}',
      model: 'sonnet',
      dependsOn: prevId ? [prevId] : [],
    }]);
  };

  const removeStep = (id: string) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter(s => s.id !== id));
  };

  const updateStep = (id: string, updates: Partial<StepDef>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name, description, color, steps, isPreset: workflow?.isPreset || false });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {workflow?.id ? 'Edit Workflow' : 'Create Workflow'}
          </h3>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Name + Description */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name..."
            className="h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description..."
            className="h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-500">Color</span>
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={cn('w-6 h-6 rounded-full border-2 transition-all', color === c ? 'border-zinc-900 dark:border-white scale-110' : 'border-transparent')}
              style={{ backgroundColor: c }} />
          ))}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Steps</div>
          {steps.map((step, i) => (
            <div key={step.id}>
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-500">{i + 1}</div>
                    <span className="text-xs font-bold text-zinc-500">Step</span>
                  </div>
                  {steps.length > 1 && (
                    <button onClick={() => removeStep(step.id)} className="text-zinc-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input value={step.name} onChange={(e) => updateStep(step.id, { name: e.target.value })} placeholder="Step name..."
                    className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  <select value={step.model} onChange={(e) => updateStep(step.id, { model: e.target.value })}
                    className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm cursor-pointer">
                    <option value="haiku">Haiku</option>
                    <option value="sonnet">Sonnet</option>
                    <option value="opus">Opus</option>
                  </select>
                  <select value={step.agent || ''} onChange={(e) => updateStep(step.id, { agent: e.target.value || undefined })}
                    className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm cursor-pointer">
                    <option value="">No agent</option>
                    {agents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                </div>
                <textarea value={step.prompt} onChange={(e) => updateStep(step.id, { prompt: e.target.value })}
                  placeholder="Step prompt... Use {{input}} for user input, {{step_N_output}} for previous step output"
                  rows={3} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-zinc-300 dark:text-zinc-600" /></div>
              )}
            </div>
          ))}
          <button onClick={addStep} className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add Step
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button onClick={onCancel} className="h-10 px-5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!name.trim() || steps.length === 0}
            className="h-10 px-6 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 shadow-sm flex items-center gap-2">
            <Save className="w-4 h-4" /> Save Workflow
          </button>
        </div>
      </div>
    </div>
  );
}
