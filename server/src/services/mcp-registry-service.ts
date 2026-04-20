import { McpMarketplaceServer } from '../types/index.js';

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const MAX_PAGES = 50;
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

interface RawEnvVar {
  name: string;
  isRequired?: boolean;
  isSecret?: boolean;
}

interface RawHeader {
  name: string;
  isRequired?: boolean;
}

interface RawPackage {
  registryType: string;
  identifier: string;
  version?: string;
  transport?: { type: string; url?: string };
  environmentVariables?: RawEnvVar[];
}

interface RawRemote {
  type: string;
  url: string;
  headers?: RawHeader[];
}

interface RawServer {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  icons?: { src: string; sizes?: string[] }[];
  repository?: { url: string; source?: string };
  packages?: RawPackage[];
  remotes?: RawRemote[];
}

interface RegistryPage {
  servers: { server: RawServer; _meta?: any }[];
  metadata?: { nextCursor?: string; count?: number };
}

export class McpRegistryService {
  private cache: McpMarketplaceServer[] = [];
  private lastFetchedAt: Date | null = null;
  private fetching = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  async init(): Promise<void> {
    // Start background fetch — don't block server startup
    this.fetchAndCache().catch((e) =>
      console.error('[MCP Registry] Init fetch failed:', e.message)
    );
    this.refreshTimer = setInterval(() => {
      this.fetchAndCache().catch((e) =>
        console.error('[MCP Registry] Refresh failed:', e.message)
      );
    }, REFRESH_INTERVAL_MS);
  }

  getAll(): McpMarketplaceServer[] {
    return this.cache;
  }

  search(params: {
    query?: string;
    transport?: 'remote' | 'local' | 'all';
    page?: number;
    pageSize?: number;
  }): { servers: McpMarketplaceServer[]; total: number; page: number; pageSize: number } {
    const { query, transport = 'all', page = 1, pageSize = 30 } = params;

    let results = this.cache;

    // Filter by transport tab
    if (transport === 'remote') {
      results = results.filter((s) => s.transportLabel === 'Remote');
    } else if (transport === 'local') {
      results = results.filter((s) => s.transportLabel === 'Local');
    }

    // Filter by search query
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
      );
    }

    const total = results.length;
    const start = (page - 1) * pageSize;
    const paged = results.slice(start, start + pageSize);

    return { servers: paged, total, page, pageSize };
  }

  getById(id: string): McpMarketplaceServer | undefined {
    return this.cache.find((s) => s.id === id);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async fetchAndCache(): Promise<void> {
    if (this.fetching) return;
    this.fetching = true;

    try {
      console.log('[MCP Registry] Fetching from official registry...');
      const raw = await this.fetchAllPages();
      const seen = new Set<string>();
      const servers: McpMarketplaceServer[] = [];

      for (const entry of raw) {
        // Deduplicate by name (keep latest — first encountered since API returns newest first)
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);

        const normalized = this.normalize(entry);
        if (normalized) servers.push(normalized);
      }

      this.cache = servers;
      this.lastFetchedAt = new Date();
      console.log(
        `[MCP Registry] Cached ${servers.length} zero-config servers (from ${raw.length} total)`
      );
    } finally {
      this.fetching = false;
    }
  }

  private async fetchAllPages(): Promise<RawServer[]> {
    const all: RawServer[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      try {
        const url = cursor
          ? `${REGISTRY_BASE}?cursor=${encodeURIComponent(cursor)}`
          : REGISTRY_BASE;

        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          console.error(`[MCP Registry] Page ${page} HTTP ${res.status}`);
          break;
        }

        const data: RegistryPage = await res.json();
        if (!data.servers?.length) break;

        for (const entry of data.servers) {
          if (entry.server) all.push(entry.server);
        }

        cursor = data.metadata?.nextCursor;
        if (!cursor) break;
      } catch (e: any) {
        console.error(`[MCP Registry] Page ${page} fetch error: ${e.message}`);
        break;
      }
    }

    return all;
  }

  private isZeroConfigRemote(remote: RawRemote): boolean {
    if (!remote.url) return false;
    if (!remote.headers?.length) return true;
    return !remote.headers.some((h) => h.isRequired);
  }

  private isZeroConfigPackage(pkg: RawPackage): boolean {
    if (pkg.registryType !== 'npm') return false;
    if (!pkg.identifier) return false;
    if (!pkg.environmentVariables?.length) return true;
    return !pkg.environmentVariables.some((e) => e.isRequired);
  }

  private normalize(raw: RawServer): McpMarketplaceServer | null {
    if (!raw.name || !raw.description) return null;

    const title = raw.title || raw.name.split('/').pop() || raw.name;
    const iconUrl = raw.icons?.[0]?.src;
    const repositoryUrl = raw.repository?.url;

    // Prefer zero-config remote over npm
    const zeroConfigRemote = raw.remotes?.find((r) =>
      (r.type === 'streamable-http' || r.type === 'sse') && this.isZeroConfigRemote(r)
    );

    if (zeroConfigRemote) {
      return {
        id: raw.name,
        title,
        description: raw.description,
        version: raw.version,
        iconUrl,
        repositoryUrl,
        transport: zeroConfigRemote.type as 'streamable-http' | 'sse',
        transportLabel: 'Remote',
        remoteUrl: zeroConfigRemote.url,
        remoteType: zeroConfigRemote.type as 'streamable-http' | 'sse',
        source: 'registry',
      };
    }

    // Fall back to zero-config npm package
    const zeroConfigPkg = raw.packages?.find((p) => this.isZeroConfigPackage(p));

    if (zeroConfigPkg) {
      return {
        id: raw.name,
        title,
        description: raw.description,
        version: raw.version,
        iconUrl,
        repositoryUrl,
        transport: 'stdio',
        transportLabel: 'Local',
        npmPackage: zeroConfigPkg.identifier,
        source: 'registry',
      };
    }

    // Server requires config — skip
    return null;
  }
}
