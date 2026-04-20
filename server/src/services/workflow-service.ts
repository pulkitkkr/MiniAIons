import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { SavedWorkflow, WorkflowStepDef } from '../types/index.js';

export class WorkflowService {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'workflows');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async list(): Promise<SavedWorkflow[]> {
    const files = await fs.readdir(this.dir);
    const workflows: SavedWorkflow[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        workflows.push(JSON.parse(await fs.readFile(path.join(this.dir, f), 'utf-8')));
      } catch {}
    }
    return workflows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async get(id: string): Promise<SavedWorkflow | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, `${id}.json`), 'utf-8'));
    } catch {
      return null;
    }
  }

  async create(input: Omit<SavedWorkflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedWorkflow> {
    const now = new Date().toISOString();
    const workflow: SavedWorkflow = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    await fs.writeFile(path.join(this.dir, `${workflow.id}.json`), JSON.stringify(workflow, null, 2));
    return workflow;
  }

  async update(id: string, updates: Partial<SavedWorkflow>): Promise<SavedWorkflow | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id: existing.id, updatedAt: new Date().toISOString() };
    await fs.writeFile(path.join(this.dir, `${id}.json`), JSON.stringify(updated, null, 2));
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    if (existing.isPreset) return false;
    try {
      await fs.unlink(path.join(this.dir, `${id}.json`));
      return true;
    } catch {
      return false;
    }
  }

  async seed(): Promise<void> {
    const existing = await this.list();
    if (existing.length > 0) return;

    const presets: Omit<SavedWorkflow, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'Plan a Trip',
        description: 'Research destinations, build an itinerary, and estimate costs',
        color: '#3B82F6',
        isPreset: true,
        steps: [
          { id: '1', name: 'Research', prompt: 'Research the best options for this trip. Consider flights, accommodation, local transport, and must-see activities. Give practical recommendations with price ranges:\n\n{{input}}', model: 'sonnet', dependsOn: [] },
          { id: '2', name: 'Build Itinerary', prompt: 'Based on this research, create a detailed day-by-day itinerary. Include times, locations, travel between spots, estimated costs per day, and a total budget breakdown:\n\n{{step_1_output}}', model: 'sonnet', dependsOn: ['1'] },
        ],
      },
      {
        name: 'Smart Purchase',
        description: 'Deep product research with a clear recommendation',
        color: '#06B6D4',
        isPreset: true,
        steps: [
          { id: '1', name: 'Research', prompt: 'Research the top 5-7 options for this purchase. For each, list key specs, price, pros and cons. Be thorough:\n\n{{input}}', model: 'sonnet', dependsOn: [] },
          { id: '2', name: 'Recommend', prompt: 'Based on this research, provide a clear final recommendation. Create a comparison table, rank the top 3, and explain which one to buy and why. Include where to buy for best price:\n\n{{step_1_output}}', model: 'sonnet', dependsOn: ['1'] },
        ],
      },
      {
        name: 'Budget Check-Up',
        description: 'Analyze spending and create an actionable budget plan',
        color: '#10B981',
        isPreset: true,
        steps: [
          { id: '1', name: 'Analyze', prompt: 'Analyze these expenses. Categorize everything, calculate percentages, identify patterns and where money is going. Compare to recommended budget ratios:\n\n{{input}}', model: 'sonnet', dependsOn: [] },
          { id: '2', name: 'Plan', prompt: 'Based on this spending analysis, create a practical monthly budget. Include specific saving opportunities, a realistic target budget per category, and 3 actionable steps to start this month:\n\n{{step_1_output}}', model: 'sonnet', dependsOn: ['1'] },
        ],
      },
      {
        name: 'Wellness Plan',
        description: 'Personalized meal plans and exercise routines',
        color: '#EC4899',
        isPreset: true,
        steps: [
          { id: '1', name: 'Meal Plan', prompt: 'Create a practical 7-day meal plan. Include breakfast, lunch, dinner, and snacks. Add a grocery list organized by section. Keep recipes simple (under 30 min):\n\n{{input}}', model: 'sonnet', dependsOn: [] },
          { id: '2', name: 'Exercise Plan', prompt: "Based on this person's goals and meal plan, create a complementary weekly exercise routine. Include warm-up, main workout, and cool-down for each day. Keep it realistic for a busy schedule:\n\n{{step_1_output}}", model: 'sonnet', dependsOn: ['1'] },
        ],
      },
    ];

    for (const preset of presets) {
      await this.create(preset);
    }
    console.log(`[Workflows] Seeded ${presets.length} preset workflows`);
  }
}
