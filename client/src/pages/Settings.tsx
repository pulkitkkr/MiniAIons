import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useUIStore } from '../stores/ui-store';
import { Sun, Moon, Monitor, Info, ExternalLink, Github, Heart } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Settings() {
  const { theme, setTheme } = useUIStore();
  const [claudeSettings, setClaudeSettings] = useState<any>(null);
  const [providers, setProviders] = useState<any>(null);

  useEffect(() => { api.getClaudeSettings().then(setClaudeSettings); api.getProviders().then(setProviders); }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Configure MyAgents preferences</p>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4">Appearance</h2>
        <div className="flex gap-3">
          {([
            { value: 'light' as const, icon: Sun, label: 'Light', desc: 'Clean white theme' },
            { value: 'dark' as const, icon: Moon, label: 'Dark', desc: 'Easy on the eyes' },
            { value: 'system' as const, icon: Monitor, label: 'System', desc: 'Match OS setting' },
          ]).map(({ value, icon: Icon, label, desc }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                theme === value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
              )}
            >
              <Icon className={cn('w-5 h-5', theme === value ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400')} />
              <span className={cn('text-sm font-semibold', theme === value ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-300')}>{label}</span>
              <span className="text-[11px] text-zinc-400">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Providers */}
      {providers && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4">CLI Providers</h2>
          {Object.entries(providers).map(([id, config]: [string, any]) => (
            <div key={id} className="flex items-center gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/30 flex items-center justify-center">
                <span className="text-base">🤖</span>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{config.name}</div>
                <code className="text-[11px] text-zinc-400 font-mono">{config.command}</code>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {config.models?.map((m: any) => (
                  <span key={m.id} className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 font-medium">{m.id}</span>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-zinc-400 mt-3 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Edit <code className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-[11px] font-mono">config/providers.json</code> to add new providers (e.g., Copilot CLI)
          </p>
        </div>
      )}

      {/* Claude Settings */}
      {claudeSettings && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4">Claude CLI Configuration</h2>
          <pre className="text-[12px] font-mono bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/50 p-4 rounded-xl overflow-x-auto text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {JSON.stringify(claudeSettings, null, 2)}
          </pre>
          <p className="text-xs text-zinc-400 mt-3 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Located at <code className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-[11px] font-mono">~/.claude/settings.json</code>
          </p>
        </div>
      )}

      {/* About */}
      <div className="bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950/20 dark:to-violet-950/20 border border-blue-200 dark:border-blue-800/30 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">MyAgents v1.0.0</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Local command center for Claude CLI agents</p>
          </div>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          100% open source. All data stays on your machine. Built with React, Express, WebSocket, and Tailwind CSS.
        </p>
      </div>
    </div>
  );
}
