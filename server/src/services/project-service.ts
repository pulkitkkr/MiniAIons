import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Project } from '../types/index.js';

export class ProjectService {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = path.join(dataDir, 'projects');
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async list(): Promise<Project[]> {
    await this.init();
    const files = await fs.readdir(this.dataDir);
    const projects: Project[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      projects.push(JSON.parse(await fs.readFile(path.join(this.dataDir, f), 'utf-8')));
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Project | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dataDir, `${id}.json`), 'utf-8'));
    } catch {
      return null;
    }
  }

  async create(name: string, description = '', color = '#3B82F6'): Promise<Project> {
    const project: Project = {
      id: randomUUID(),
      name,
      description,
      color,
      sessionIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.save(project);
    return project;
  }

  async update(id: string, updates: Partial<Project>): Promise<Project | null> {
    const project = await this.get(id);
    if (!project) return null;
    Object.assign(project, updates, { updatedAt: new Date().toISOString() });
    await this.save(project);
    return project;
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.dataDir, `${id}.json`));
    } catch {}
  }

  async addSession(projectId: string, sessionId: string): Promise<void> {
    const project = await this.get(projectId);
    if (project && !project.sessionIds.includes(sessionId)) {
      project.sessionIds.push(sessionId);
      project.updatedAt = new Date().toISOString();
      await this.save(project);
    }
  }

  async removeSession(projectId: string, sessionId: string): Promise<void> {
    const project = await this.get(projectId);
    if (project) {
      project.sessionIds = project.sessionIds.filter((s) => s !== sessionId);
      project.updatedAt = new Date().toISOString();
      await this.save(project);
    }
  }

  private async save(project: Project): Promise<void> {
    await this.init();
    await fs.writeFile(path.join(this.dataDir, `${project.id}.json`), JSON.stringify(project, null, 2));
  }
}
