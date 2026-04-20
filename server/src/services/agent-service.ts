import * as fs from 'fs/promises';
import * as path from 'path';
import { Agent, AgentInput } from '../types/index.js';

/**
 * Manages Claude Code subagent definitions as .md files in ~/.claude/agents/.
 * Files use YAML frontmatter for config and markdown body for the system prompt.
 * The Claude CLI auto-discovers agents from this directory.
 */
export class AgentService {
  private agentsDir: string;

  constructor(agentsDir?: string) {
    this.agentsDir = agentsDir || path.join(process.env.HOME || '', '.claude', 'agents');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.agentsDir, { recursive: true });
  }

  async list(): Promise<Agent[]> {
    await this.init();
    const files = await fs.readdir(this.agentsDir);
    const agents: Agent[] = [];
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      try {
        const content = await fs.readFile(path.join(this.agentsDir, f), 'utf-8');
        const agent = this.parseAgentFile(f.replace('.md', ''), content);
        if (agent) agents.push(agent);
      } catch {}
    }
    return agents;
  }

  async get(name: string): Promise<Agent | null> {
    try {
      const content = await fs.readFile(path.join(this.agentsDir, `${name}.md`), 'utf-8');
      return this.parseAgentFile(name, content);
    } catch {
      return null;
    }
  }

  async create(input: AgentInput): Promise<Agent> {
    await this.init();
    const name = this.sanitizeName(input.name);
    const filePath = path.join(this.agentsDir, `${name}.md`);

    // Check if already exists
    try {
      await fs.access(filePath);
      throw new Error(`Agent "${name}" already exists`);
    } catch (e: any) {
      if (e.message?.includes('already exists')) throw e;
    }

    const agent: Agent = {
      name,
      description: input.description,
      model: input.model || 'sonnet',
      tools: input.tools || [],
      mcpServers: input.mcpServers || [],
      systemPrompt: input.systemPrompt,
    };

    await fs.writeFile(filePath, this.serializeAgent(agent));
    return agent;
  }

  async update(name: string, input: Partial<AgentInput>): Promise<Agent | null> {
    const existing = await this.get(name);
    if (!existing) return null;

    const updated: Agent = {
      ...existing,
      ...input,
      name: existing.name, // name can't change (it's the filename)
    };

    await fs.writeFile(path.join(this.agentsDir, `${name}.md`), this.serializeAgent(updated));
    return updated;
  }

  async delete(name: string): Promise<boolean> {
    try {
      await fs.unlink(path.join(this.agentsDir, `${name}.md`));
      return true;
    } catch {
      return false;
    }
  }

  // ── Parsing / serialization ────────────────────────────────────────────

  private parseAgentFile(fallbackName: string, content: string): Agent | null {
    // Split on frontmatter delimiters: ---\n...\n---
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!fmMatch) {
      // No frontmatter — treat entire content as system prompt (legacy template format)
      const nameMatch = content.match(/^#\s+(.+)/m);
      const descMatch = content.match(/^>\s+(.+)/m);
      return {
        name: fallbackName,
        description: descMatch?.[1] || '',
        model: 'sonnet',
        tools: [],
        mcpServers: [],
        systemPrompt: content,
      };
    }

    const frontmatter = fmMatch[1];
    const body = fmMatch[2].trim();

    // Simple YAML parser for our flat structure
    const fm = this.parseFrontmatter(frontmatter);

    return {
      name: fm.name || fallbackName,
      description: fm.description || '',
      model: fm.model || 'sonnet',
      tools: this.parseList(fm.tools),
      mcpServers: this.parseList(fm.mcpServers),
      systemPrompt: body,
    };
  }

  private parseFrontmatter(text: string): Record<string, string> {
    const result: Record<string, string> = {};
    let currentKey = '';

    for (const line of text.split('\n')) {
      const kvMatch = line.match(/^(\w[\w\-]*)\s*:\s*(.*)$/);
      if (kvMatch) {
        currentKey = kvMatch[1];
        const value = kvMatch[2].trim();
        if (value) {
          result[currentKey] = value;
        } else {
          result[currentKey] = ''; // will collect list items below
        }
      } else if (currentKey && line.match(/^\s+-\s+/)) {
        // List item under current key
        const item = line.replace(/^\s+-\s+/, '').trim();
        result[currentKey] = result[currentKey] ? `${result[currentKey]},${item}` : item;
      }
    }

    return result;
  }

  private parseList(value?: string): string[] {
    if (!value) return [];
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }

  private serializeAgent(agent: Agent): string {
    let fm = '---\n';
    fm += `name: ${agent.name}\n`;
    fm += `description: ${agent.description}\n`;
    fm += `model: ${agent.model}\n`;
    if (agent.tools.length > 0) {
      fm += 'tools:\n';
      for (const t of agent.tools) fm += `  - ${t}\n`;
    }
    if (agent.mcpServers.length > 0) {
      fm += 'mcpServers:\n';
      for (const m of agent.mcpServers) fm += `  - ${m}\n`;
    }
    fm += '---\n\n';
    return fm + agent.systemPrompt;
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
