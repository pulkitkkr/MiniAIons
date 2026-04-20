import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { McpServer, McpRegistryEntry } from '../types/index.js';

const execAsync = promisify(exec);

/**
 * Manages MCP servers through the Claude CLI.
 *
 * - Add/remove/update go through `claude mcp add-json` / `claude mcp add --transport` / `claude mcp remove`
 * - Listing reads ~/.claude.json directly (fast, no health-check overhead)
 * - Supports both stdio (npx) and remote (http/sse) transports
 */
export class McpManager {
  private claudeJsonPath: string;
  private registryPath: string;

  constructor(claudeJsonPath: string, registryPath: string) {
    this.claudeJsonPath = claudeJsonPath;
    this.registryPath = registryPath;
  }

  private async readClaudeJson(): Promise<any> {
    try {
      return JSON.parse(await fs.readFile(this.claudeJsonPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  // ── CLI wrappers ─────────────────────────────────────────────────────────

  private async cliAdd(name: string, config: { command: string; args?: string[]; env?: Record<string, string> }): Promise<void> {
    const json: any = { command: config.command };
    if (config.args?.length) json.args = config.args;
    if (config.env && Object.keys(config.env).length) json.env = config.env;

    const jsonStr = JSON.stringify(json).replace(/'/g, "'\\''");
    const cmd = `claude mcp add-json -s user ${shellEscape(name)} '${jsonStr}'`;
    console.log(`[MCP CLI] ${cmd}`);
    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });
      if (stdout) console.log(`[MCP CLI] ${stdout.trim()}`);
      if (stderr) console.log(`[MCP CLI stderr] ${stderr.trim()}`);
    } catch (e: any) {
      console.error(`[MCP CLI] add failed: ${e.message?.slice(0, 200)}`);
      throw new Error(`Failed to register MCP server via CLI: ${e.message}`);
    }
  }

  private async cliRemove(name: string): Promise<void> {
    const cmd = `claude mcp remove -s user ${shellEscape(name)}`;
    console.log(`[MCP CLI] ${cmd}`);
    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 15000 });
      if (stdout) console.log(`[MCP CLI] ${stdout.trim()}`);
      if (stderr) console.log(`[MCP CLI stderr] ${stderr.trim()}`);
    } catch (e: any) {
      if (!e.message?.includes('not found') && !e.message?.includes('No MCP server')) {
        console.error(`[MCP CLI] remove failed: ${e.message?.slice(0, 200)}`);
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async listInstalled(): Promise<McpServer[]> {
    const config = await this.readClaudeJson();
    const servers = config.mcpServers || {};
    return Object.entries(servers).map(([name, cfg]: [string, any]) => {
      // Remote servers: { type: "http"|"sse", url: "https://..." }
      if (cfg.type === 'http' || cfg.type === 'sse' || cfg.type === 'streamable-http') {
        return {
          name,
          command: cfg.url || '',
          transport: (cfg.type === 'streamable-http' ? 'http' : cfg.type) as 'http' | 'sse',
          url: cfg.url,
          status: 'configured' as const,
        };
      }
      // Stdio servers: { command: "npx", args: [...] }
      return {
        name,
        command: cfg.command,
        args: cfg.args,
        env: cfg.env,
        transport: 'stdio' as const,
        status: 'configured' as const,
      };
    });
  }

  async addServer(name: string, config: Omit<McpServer, 'name' | 'status'>): Promise<void> {
    await this.cliAdd(name, {
      command: config.command,
      args: config.args,
      env: config.env,
    });
  }

  async removeServer(name: string): Promise<void> {
    await this.cliRemove(name);
  }

  async updateServer(name: string, config: Partial<McpServer>): Promise<void> {
    const claudeJson = await this.readClaudeJson();
    const existing = claudeJson.mcpServers?.[name];
    if (!existing) return;

    const merged = {
      command: config.command || existing.command,
      args: config.args || existing.args || [],
      env: { ...(existing.env || {}), ...(config.env || {}) },
    };

    for (const [k, v] of Object.entries(merged.env)) {
      if (v === null || v === undefined) delete merged.env[k];
    }

    await this.cliRemove(name);
    await this.cliAdd(name, merged);
  }

  /** Install a remote HTTP/SSE server via `claude mcp add --transport`. */
  async installRemote(
    name: string,
    url: string,
    transport: 'http' | 'sse'
  ): Promise<{ success: boolean; message: string }> {
    const cmd = `claude mcp add --transport ${transport} -s user ${shellEscape(name)} ${shellEscape(url)}`;
    console.log(`[MCP CLI] ${cmd}`);
    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });
      if (stdout) console.log(`[MCP CLI] ${stdout.trim()}`);
      if (stderr) console.log(`[MCP CLI stderr] ${stderr.trim()}`);
      return { success: true, message: `Connected to remote server ${name}` };
    } catch (e: any) {
      console.error(`[MCP CLI] remote add failed: ${e.message?.slice(0, 200)}`);
      return { success: false, message: `Failed to add remote server: ${e.message}` };
    }
  }

  /** Install an npm package as a stdio MCP server via npx. */
  async installNpmPackage(
    name: string,
    npmPackage: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.cliAdd(name, {
        command: 'npx',
        args: ['-y', npmPackage],
      });
      return { success: true, message: `Installed ${name} via npx` };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  /** Unified install from the dynamic marketplace. */
  async installFromMarketplace(server: {
    id: string;
    transport: string;
    remoteUrl?: string;
    remoteType?: string;
    npmPackage?: string;
  }): Promise<{ success: boolean; message: string }> {
    const shortName = server.id.includes('/') ? server.id.split('/').pop()! : server.id;

    if (server.remoteUrl && server.remoteType) {
      const transportArg = server.remoteType === 'streamable-http' ? 'http' : 'sse';
      return this.installRemote(shortName, server.remoteUrl, transportArg);
    } else if (server.npmPackage) {
      return this.installNpmPackage(shortName, server.npmPackage);
    }
    return { success: false, message: 'No installable transport found' };
  }

  // ── Curated registry (static fallback) ───────────────────────────────────

  async getRegistry(): Promise<McpRegistryEntry[]> {
    try {
      const data = JSON.parse(await fs.readFile(this.registryPath, 'utf-8'));
      return data.registry || [];
    } catch {
      return [];
    }
  }

  async installFromRegistry(
    name: string,
    envOverrides?: Record<string, string>,
    argsOverrides?: string[]
  ): Promise<{ success: boolean; message: string }> {
    const registry = await this.getRegistry();
    const entry = registry.find((r) => r.name === name);
    if (!entry) return { success: false, message: 'Not found in registry' };

    try {
      const installCmd = entry.installCmd || `npm install -g ${entry.command}`;
      console.log(`[MCP Install] Running: ${installCmd}`);
      const { stdout, stderr } = await execAsync(installCmd, { timeout: 180000 });
      if (stdout) console.log(`[MCP Install] ${stdout.slice(0, 200)}`);
      if (stderr && !stderr.includes('npm warn')) console.log(`[MCP Install stderr] ${stderr.slice(0, 200)}`);
    } catch (e: any) {
      console.log(`[MCP Install] Global install failed, will configure for npx usage: ${e.message?.slice(0, 100)}`);
    }

    const mergedEnv = { ...(entry.env || {}) };
    if (envOverrides) {
      for (const [k, v] of Object.entries(envOverrides)) {
        if (v !== undefined && v !== '') mergedEnv[k] = v;
      }
    }

    const finalArgs = argsOverrides && argsOverrides.length > 0 ? argsOverrides : (entry.args || []);

    const useNpx = entry.command.startsWith('@') || entry.command.includes('/');
    await this.addServer(name, {
      command: useNpx ? 'npx' : entry.command,
      args: useNpx ? ['-y', entry.command, ...finalArgs] : finalArgs,
      env: mergedEnv,
    });

    return { success: true, message: `Installed and configured ${name}` };
  }
}

function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9._\-/:]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
