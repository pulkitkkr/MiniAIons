import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useUIStore } from '../../stores/ui-store';

export default function MainLayout() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const location = useLocation();
  const isSessionPage = location.pathname.startsWith('/session/');
  const isRunPage = location.pathname.startsWith('/workflows/runs/');

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <div
        className="flex flex-1 flex-col min-w-0 transition-all duration-200 ease-in-out"
        style={{ marginLeft: sidebarOpen ? 256 : 68 }}
      >
        <Header />
        <main className="flex-1 overflow-auto">
          {(isSessionPage || isRunPage) ? (
            /* Session pages get full width, no padding — they manage their own layout */
            <div className="h-full">
              <Outlet />
            </div>
          ) : (
            <div className="p-5 md:p-8 max-w-6xl mx-auto w-full">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
