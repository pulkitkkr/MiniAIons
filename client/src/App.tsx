import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { wsClient } from './lib/ws';
import { useSessionStore } from './stores/session-store';
import { api } from './lib/api';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import SessionView from './pages/SessionView';
import Projects from './pages/Projects';
import McpManager from './pages/McpManager';
import Agents from './pages/Agents';
import Settings from './pages/Settings';
import Workflows from './pages/Workflows';
import WorkflowRunView from './pages/WorkflowRunView';

export default function App() {
  const appendEvent = useSessionStore((s) => s.appendEvent);
  const upsertSession = useSessionStore((s) => s.upsertSession);

  useEffect(() => {
    wsClient.connect();

    const unsub = wsClient.subscribe((msg) => {
      if (msg.type === 'session:event') {
        appendEvent(msg.sessionId, msg.event);
      } else if (msg.type === 'session:status') {
        upsertSession(msg.sessionId, { status: msg.status });
      } else if (msg.type === 'session:created') {
        upsertSession(msg.session.id, {
          ...msg.session,
          messages: [],
          provider: msg.session.providerId,
        });
      }
      // workflow:update is handled directly by WorkflowRunView via its own wsClient.subscribe
    });

    // Load existing sessions
    api.getSessions().then((sessions) => {
      sessions.forEach((s: any) => {
        upsertSession(s.id, { ...s, messages: [], provider: s.providerId });
      });
    });

    return () => {
      unsub();
      wsClient.disconnect();
    };
  }, []);

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="session/:sessionId" element={<SessionView />} />
        <Route path="projects" element={<Projects />} />
        <Route path="mcps" element={<McpManager />} />
        <Route path="agents" element={<Agents />} />
        <Route path="workflows" element={<Workflows />} />
        <Route path="workflows/runs/:runId" element={<WorkflowRunView />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
