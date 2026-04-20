import { Sun, Moon, Monitor, Activity, Coins, Cpu } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';
import { useSessionStore } from '../../stores/session-store';
import { formatCost, formatTokens } from '../../lib/utils';

export default function Header() {
  const { theme, setTheme } = useUIStore();
  const sessions = useSessionStore((s) => s.sessions);

  const totalCost = Object.values(sessions).reduce((sum, s) => sum + (s.costUsd || 0), 0);
  const activeSessions = Object.values(sessions).filter((s) => s.status === 'busy' || s.status === 'idle');
  const busySessions = Object.values(sessions).filter((s) => s.status === 'busy');
  const totalTokens = Object.values(sessions).reduce((sum, s) => sum + (s.inputTokens || 0) + (s.outputTokens || 0), 0);

  const nextTheme = () => {
    const cycle: Record<string, 'light' | 'dark' | 'system'> = { light: 'dark', dark: 'system', system: 'light' };
    setTheme(cycle[theme]);
  };
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        {busySessions.length > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/30">
            <Activity className="w-3 h-3 text-amber-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{busySessions.length} running</span>
          </div>
        )}
        <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
          {activeSessions.length} active session{activeSessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
          <Cpu className="w-3 h-3 text-zinc-400" />
          <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">{formatTokens(totalTokens)}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/30">
          <Coins className="w-3 h-3 text-emerald-500" />
          <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCost(totalCost)}</span>
        </div>
        <button
          onClick={nextTheme}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
