import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import {
  Puzzle, Download, Trash2, CheckCircle2, Loader2, Search, Plus, X,
  Globe, Terminal, ExternalLink, Wifi, Package, ChevronLeft, ChevronRight
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface MarketplaceServer {
  id: string;
  title: string;
  description: string;
  version?: string;
  iconUrl?: string;
  repositoryUrl?: string;
  transport: 'stdio' | 'streamable-http' | 'sse';
  transportLabel: 'Remote' | 'Local';
  remoteUrl?: string;
  remoteType?: 'streamable-http' | 'sse';
  npmPackage?: string;
}

interface InstalledServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  status: string;
  transport?: 'stdio' | 'http' | 'sse';
  url?: string;
}

// ── Transport badge ─────────────────────────────────────────────────────────

const TRANSPORT_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'streamable-http': { label: 'HTTP', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-800/30' },
  'sse':             { label: 'SSE', color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-100 dark:bg-teal-900/30', border: 'border-teal-200 dark:border-teal-800/30' },
  'stdio':           { label: 'NPM', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-200 dark:border-blue-800/30' },
  'http':            { label: 'HTTP', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-800/30' },
};

// ── Skeleton Card ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl animate-pulse">
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-zinc-200 dark:bg-zinc-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-700 rounded" />
          <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-800 rounded" />
          <div className="h-3 w-2/3 bg-zinc-100 dark:bg-zinc-800 rounded" />
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
        <div className="h-5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
        <div className="h-8 w-20 bg-zinc-200 dark:bg-zinc-700 rounded-lg" />
      </div>
    </div>
  );
}

// ── Server Card ─────────────────────────────────────────────────────────────

function ServerCard({ server, isInstalled, isInstalling, onInstall }: {
  server: MarketplaceServer;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
}) {
  const badge = TRANSPORT_BADGE[server.transport] || TRANSPORT_BADGE['streamable-http'];
  const isRemote = server.transportLabel === 'Remote';

  return (
    <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:shadow-md transition-all">
      <div className="flex items-start gap-3.5">
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border',
          isRemote
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30'
            : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30'
        )}>
          {server.iconUrl ? (
            <img src={server.iconUrl} alt="" className="w-6 h-6 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : isRemote ? (
            <Globe className="w-5 h-5 text-emerald-500" />
          ) : (
            <Terminal className="w-5 h-5 text-blue-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{server.title}</span>
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border', badge.bg, badge.color, badge.border)}>
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">{server.description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          {server.version && <span className="text-[10px] text-zinc-400 font-mono">v{server.version}</span>}
          {server.repositoryUrl && (
            <a href={server.repositoryUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        {isInstalled ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4" /> Installed
          </span>
        ) : (
          <button onClick={onInstall} disabled={isInstalling}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 shadow-sm transition-all">
            {isInstalling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {isInstalling ? 'Adding...' : 'Install'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

export default function McpManager() {
  // Installed
  const [installed, setInstalled] = useState<InstalledServer[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);

  // Marketplace
  const [servers, setServers] = useState<MarketplaceServer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'remote' | 'local'>('remote');
  const [page, setPage] = useState(1);

  // Custom add
  const [showAdd, setShowAdd] = useState(false);
  const [customMcp, setCustomMcp] = useState({ name: '', command: '', args: '' });

  // Load installed on mount
  const loadInstalled = async () => {
    const i = await api.getInstalledMcps();
    setInstalled(i);
  };
  useEffect(() => { loadInstalled(); }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(searchQuery); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch marketplace when tab/search/page changes
  useEffect(() => {
    setLoading(true);
    api.getMarketplace({
      query: debouncedQuery || undefined,
      transport: activeTab,
      page,
      pageSize: PAGE_SIZE,
    }).then(result => {
      setServers(result.servers);
      setTotal(result.total);
      setLoading(false);
    }).catch(() => {
      setServers([]);
      setTotal(0);
      setLoading(false);
    });
  }, [activeTab, debouncedQuery, page]);

  // Installed names set for matching
  const installedNames = new Set(installed.map((s) => s.name));
  const isServerInstalled = (server: MarketplaceServer) => {
    const shortName = server.id.includes('/') ? server.id.split('/').pop()! : server.id;
    return installedNames.has(shortName) || installedNames.has(server.id);
  };

  // Handlers
  const handleInstall = async (server: MarketplaceServer) => {
    setInstalling(server.id);
    try {
      const result = await api.installFromMarketplace({
        id: server.id,
        transport: server.transport,
        remoteUrl: server.remoteUrl,
        remoteType: server.remoteType,
        npmPackage: server.npmPackage,
      });
      if (!result.success) alert(result.message);
      await loadInstalled();
    } catch (e: any) {
      alert(e.message);
    }
    setInstalling(null);
  };

  const handleRemove = async (name: string) => {
    if (!confirm(`Remove plugin "${name}"?`)) return;
    try {
      await api.removeMcp(name);
      await loadInstalled();
    } catch (e: any) {
      alert(`Failed to remove: ${e.message}`);
    }
  };

  const handleAddCustom = async () => {
    if (!customMcp.name || !customMcp.command) return;
    await api.addMcp({ name: customMcp.name, command: customMcp.command, args: customMcp.args ? customMcp.args.split(' ') : [] });
    setCustomMcp({ name: '', command: '', args: '' });
    setShowAdd(false);
    await loadInstalled();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Plugins</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Extend your agents with tools from the MCP ecosystem</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
          <Plus className="w-4 h-4" /> Custom
        </button>
      </div>

      {/* Custom add form */}
      {showAdd && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4">Add Custom Server</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={customMcp.name} onChange={(e) => setCustomMcp({ ...customMcp, name: e.target.value })} placeholder="Server name" className="h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            <input value={customMcp.command} onChange={(e) => setCustomMcp({ ...customMcp, command: e.target.value })} placeholder="Command or URL" className="h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            <input value={customMcp.args} onChange={(e) => setCustomMcp({ ...customMcp, args: e.target.value })} placeholder="Arguments (space-separated)" className="h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleAddCustom} disabled={!customMcp.name || !customMcp.command} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">Add</button>
            <button onClick={() => setShowAdd(false)} className="h-9 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">Cancel</button>
          </div>
        </div>
      )}

      {/* Installed */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Connected to Claude ({installed.length})</h2>
        {installed.length === 0 ? (
          <div className="flex flex-col items-center py-10 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
              <Puzzle className="w-7 h-7 text-zinc-300 dark:text-zinc-600" />
            </div>
            <p className="text-sm font-medium text-zinc-500">No plugins connected</p>
            <p className="text-xs text-zinc-400 mt-1">Install from the marketplace below — one click to connect</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {installed.map((server) => {
              const transport = server.transport || 'stdio';
              const badge = TRANSPORT_BADGE[transport] || TRANSPORT_BADGE['stdio'];
              const isRemote = transport === 'http' || transport === 'sse';

              return (
                <div key={server.name} className="flex items-center gap-3 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl group hover:shadow-sm transition-all">
                  <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0',
                    isRemote
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30'
                      : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30'
                  )}>
                    {isRemote ? <Globe className="w-5 h-5 text-emerald-500" /> : <Terminal className="w-5 h-5 text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{server.name}</span>
                      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider border', badge.bg, badge.color, badge.border)}>{badge.label}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate font-mono">
                      {isRemote ? server.url || server.command : server.command}
                    </div>
                  </div>
                  <button onClick={() => handleRemove(server.name)} className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Marketplace */}
      <div>
        <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Marketplace</h2>

        {/* Search + Tabs */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search servers..."
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => { setActiveTab('remote'); setPage(1); }}
              className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activeTab === 'remote' ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              )} title="HTTP/SSE servers — instant connect, zero config">
              <Wifi className="w-3 h-3" /> Remote
            </button>
            <button onClick={() => { setActiveTab('local'); setPage(1); }}
              className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activeTab === 'local' ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              )} title="NPM packages — runs locally via npx">
              <Package className="w-3 h-3" /> Local
            </button>
          </div>
        </div>

        {/* Server Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <Search className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-3" />
            <p className="text-sm font-medium text-zinc-500">
              {debouncedQuery ? `No results for "${debouncedQuery}"` : 'Loading marketplace...'}
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              {debouncedQuery ? 'Try a different search term' : 'Fetching from the official MCP registry'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {servers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  isInstalled={isServerInstalled(server)}
                  isInstalling={installing === server.id}
                  onInstall={() => handleInstall(server)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 px-1">
                <span className="text-xs text-zinc-400">
                  Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total} servers
                </span>
                <div className="flex gap-1.5">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 disabled:opacity-30 transition-all">
                    <ChevronLeft className="w-3 h-3" /> Prev
                  </button>
                  <span className="px-3 py-1.5 text-xs font-semibold text-zinc-500">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 disabled:opacity-30 transition-all">
                    Next <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
