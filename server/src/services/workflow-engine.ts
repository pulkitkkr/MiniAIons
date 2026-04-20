import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { SessionManager } from './session-manager.js';
import { ProjectService } from './project-service.js';
import { AgentService } from './agent-service.js';
import { WorkflowStepDef, WorkflowRun } from '../types/index.js';

type WorkflowListener = (run: WorkflowRun) => void;

/**
 * Interactive workflow engine.
 *
 * Steps are INTERACTIVE sessions:
 * 1. Engine creates a session for a step and sends the initial prompt
 * 2. Step status = 'active' — user can chat with the session
 * 3. User calls completeStep() when satisfied — captures last output
 * 4. Engine starts next dependent steps
 *
 * This means the user controls the pace. Each step is a full conversation.
 */
export class WorkflowEngine {
  private runs = new Map<string, WorkflowRun>();
  private listeners = new Map<string, Set<WorkflowListener>>();
  private sessionManager: SessionManager;
  private projectService: ProjectService;
  private agentService: AgentService;
  private runsDir: string;

  constructor(sessionManager: SessionManager, projectService: ProjectService, agentService?: AgentService, dataDir?: string) {
    this.sessionManager = sessionManager;
    this.projectService = projectService;
    this.agentService = agentService || new AgentService();
    this.runsDir = path.join(dataDir || '.', 'workflow-runs');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.runsDir, { recursive: true });
    try {
      const files = fsSync.readdirSync(this.runsDir);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const run: WorkflowRun = JSON.parse(fsSync.readFileSync(path.join(this.runsDir, f), 'utf-8'));
          this.runs.set(run.id, run);

          // Check for active steps with completed sessions — auto-complete them
          if (run.status === 'running') {
            for (const step of run.steps) {
              const result = run.stepResults[step.id];
              if (result?.status === 'active' && result.sessionId) {
                // Check if session's conversation has [STEP_COMPLETE]
                const convPath = path.join(this.runsDir, '..', 'conversations', `${result.sessionId}.jsonl`);
                try {
                  const convData = fsSync.readFileSync(convPath, 'utf-8');
                  if (convData.includes('[STEP_COMPLETE]')) {
                    console.log(`[Workflow ${run.id}] Auto-completing stale step "${step.name}" (signal found in conversation)`);
                    // Queue the completion (can't await in sync init)
                    setTimeout(() => this.completeStep(run.id, step.id), 1000);
                  }
                } catch {}
              }
            }
          }
        } catch {}
      }
    } catch {}
  }

  subscribe(runId: string, listener: WorkflowListener) {
    if (!this.listeners.has(runId)) this.listeners.set(runId, new Set());
    this.listeners.get(runId)!.add(listener);
    return () => { this.listeners.get(runId)?.delete(listener); };
  }

  getRun(runId: string): WorkflowRun | undefined {
    return this.runs.get(runId);
  }

  listRuns(): WorkflowRun[] {
    return Array.from(this.runs.values()).sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  deleteRun(runId: string): boolean {
    this.listeners.delete(runId);
    const deleted = this.runs.delete(runId);
    if (deleted) fs.unlink(path.join(this.runsDir, `${runId}.json`)).catch(() => {});
    return deleted;
  }

  private notify(run: WorkflowRun) {
    this.listeners.get(run.id)?.forEach((l) => l(run));
  }

  private async persistRun(run: WorkflowRun): Promise<void> {
    try {
      await fs.writeFile(path.join(this.runsDir, `${run.id}.json`), JSON.stringify(run, null, 2));
    } catch {}
  }

  /**
   * Start a workflow. Creates a project, then activates the first step(s).
   * Returns the run immediately.
   */
  async execute(opts: {
    workflowId: string;
    name: string;
    input: string;
    steps: WorkflowStepDef[];
    model?: string;
  }): Promise<WorkflowRun> {
    // Create a unique run name from the input (first 40 chars, cleaned up)
    const inputSummary = opts.input.replace(/\n/g, ' ').trim().slice(0, 40).trim();
    const runName = inputSummary
      ? `${opts.name}: ${inputSummary}${opts.input.length > 40 ? '...' : ''}`
      : opts.name;

    const run: WorkflowRun = {
      id: randomUUID(),
      workflowId: opts.workflowId,
      name: runName,
      input: opts.input,
      steps: opts.steps,
      status: 'running',
      stepResults: {},
      totalCostUsd: 0,
      startedAt: new Date().toISOString(),
    };

    for (const step of opts.steps) {
      run.stepResults[step.id] = { sessionId: '', text: '', status: 'pending', costUsd: 0 };
    }

    // Auto-create project (with workflow tag in name)
    const project = await this.projectService.create(
      runName,
      `Workflow: ${opts.name}\n\nInput: ${opts.input.slice(0, 200)}${opts.input.length > 200 ? '...' : ''}`,
      '#3B82F6'
    );
    run.projectId = project.id;

    this.runs.set(run.id, run);
    await this.persistRun(run);
    this.notify(run);

    // Activate first steps (those with no dependencies)
    await this.activateReadySteps(run, opts.model);

    return run;
  }

  /**
   * User signals a step is complete.
   * Captures the session's last output, marks step done, activates next steps.
   */
  async completeStep(runId: string, stepId: string): Promise<WorkflowRun | null> {
    const run = this.runs.get(runId);
    if (!run) return null;

    const result = run.stepResults[stepId];
    if (!result || result.status !== 'active') return run;

    // Capture output from the step's session conversation
    if (result.sessionId) {
      const session = this.sessionManager.getSession(result.sessionId);
      const buffer = this.sessionManager.getBuffer(result.sessionId);

      // Collect ALL assistant text from the session
      let allText = '';
      for (const ev of buffer) {
        if (ev.type === 'assistant' && ev.message?.content) {
          for (const block of ev.message.content) {
            if (block.type === 'text' && block.text) {
              allText += block.text + '\n';
            }
          }
        }
      }

      // Try to extract structured step_output from the signal
      const outputMatch = allText.match(/<step_output>\s*([\s\S]*?)\s*<\/step_output>/);
      if (outputMatch) {
        result.text = outputMatch[1].trim();
      } else {
        // Fallback: use the last assistant message (strip the signal marker)
        let lastText = '';
        for (let i = buffer.length - 1; i >= 0; i--) {
          const ev = buffer[i];
          if (ev.type === 'assistant' && ev.message?.content) {
            for (const block of ev.message.content) {
              if (block.type === 'text' && block.text) {
                lastText = block.text;
                break;
              }
            }
            if (lastText) break;
          }
        }
        result.text = lastText.replace(/\[STEP_COMPLETE\]/g, '').replace(/<step_output>[\s\S]*?<\/step_output>/g, '').trim();
      }

      if (session) {
        result.costUsd = session.costUsd || 0;
        run.totalCostUsd = Object.values(run.stepResults).reduce((sum, r) => sum + r.costUsd, 0);
      }
    }

    result.status = 'done';
    result.completedAt = new Date().toISOString();
    await this.persistRun(run);
    this.notify(run);

    // Check if all steps are done
    const allDone = run.steps.every(s => {
      const r = run.stepResults[s.id];
      return r.status === 'done' || r.status === 'error';
    });

    if (allDone) {
      run.status = Object.values(run.stepResults).some(r => r.status === 'error') ? 'error' : 'completed';
      run.completedAt = new Date().toISOString();
      await this.persistRun(run);
      this.notify(run);
      return run;
    }

    // Activate next steps whose dependencies are all done
    await this.activateReadySteps(run);
    return run;
  }

  /**
   * Find steps whose dependencies are all 'done' and activate them.
   * Creates a session, sends the initial prompt, marks status = 'active'.
   */
  private async activateReadySteps(run: WorkflowRun, defaultModel?: string): Promise<void> {
    const ready = run.steps.filter(step => {
      const r = run.stepResults[step.id];
      return r.status === 'pending' && step.dependsOn.every(d => run.stepResults[d]?.status === 'done');
    });

    for (let si = 0; si < ready.length; si++) {
      const step = ready[si];
      const stepNum = run.steps.findIndex(s => s.id === step.id) + 1;
      try {
        // Build prompt with placeholder substitution
        let prompt = step.prompt.replace(/\{\{input\}\}/g, run.input);
        for (const [sid, res] of Object.entries(run.stepResults)) {
          prompt = prompt.replace(new RegExp(`\\{\\{step_${sid}_output\\}\\}`, 'g'), res.text);
        }

        // Resolve agent config
        let stepModel = step.model || defaultModel || 'sonnet';
        let stepSystemPrompt: string | undefined;
        if (step.agent) {
          const agent = await this.agentService.get(step.agent);
          if (agent) {
            stepModel = agent.model || stepModel;
            stepSystemPrompt = agent.systemPrompt;
          }
        }

        // Inject step completion signal into the PROMPT itself (not system prompt)
        // This ensures the AI sees it right before generating its response
        prompt += `\n\n---\nWORKFLOW STEP INSTRUCTION: You are executing Step ${stepNum} ("${step.name}") of a multi-step workflow. After you complete your response to the above request, you MUST end your message with the following completion signal:

[STEP_COMPLETE]
<step_output>
(Put your complete output/findings/results here — this is passed to the next step)
</step_output>

This is mandatory. The workflow cannot proceed to the next step without this signal. Output the signal at the end of your FIRST response.`;

        // Create session (tagged as workflow step so sidebar can filter it out)
        const session = await this.sessionManager.createSession({
          name: `${step.name}`,
          model: stepModel,
          projectId: run.projectId,
          systemPrompt: stepSystemPrompt,
          permissionMode: 'auto',
          tags: ['workflow'],
        });

        run.stepResults[step.id].sessionId = session.id;
        run.stepResults[step.id].status = 'active';
        run.stepResults[step.id].startedAt = new Date().toISOString();
        await this.projectService.addSession(run.projectId!, session.id);
        await this.persistRun(run);
        this.notify(run);

        // Send the initial prompt (fire and forget — user continues the conversation)
        this.sessionManager.sendMessage(session.id, prompt).catch((e) => {
          console.error(`[Workflow] Step "${step.name}" initial send failed:`, e.message);
        });
      } catch (e: any) {
        run.stepResults[step.id].status = 'error';
        run.stepResults[step.id].text = e.message;
        run.stepResults[step.id].completedAt = new Date().toISOString();
        await this.persistRun(run);
        this.notify(run);
      }
    }
  }
}
