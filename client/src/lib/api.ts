const BASE = '/api';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Sessions
  getSessions: () => request<any[]>('/sessions'),
  getSession: (id: string) => request<any>(`/sessions/${id}`),
  createSession: (opts: any) => request<any>('/sessions', { method: 'POST', body: JSON.stringify(opts) }),
  deleteSession: (id: string) => request<any>(`/sessions/${id}`, { method: 'DELETE' }),
  renameSession: (id: string, name: string) =>
    request<any>(`/sessions/${id}/rename`, { method: 'PUT', body: JSON.stringify({ name }) }),
  sendMessage: (id: string, content: string, effort?: string) =>
    request<any>(`/sessions/${id}/send`, { method: 'POST', body: JSON.stringify({ content, effort }) }),
  setThinking: (id: string, enabled: boolean) =>
    request<any>(`/sessions/${id}/thinking`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  compactSession: (id: string) =>
    request<any>(`/sessions/${id}/compact`, { method: 'POST' }),
  killSession: (id: string) => request<any>(`/sessions/${id}/kill`, { method: 'POST' }),
  getConversation: (id: string) => request<any[]>(`/sessions/${id}/conversation`),

  // Projects
  getProjects: () => request<any[]>('/projects'),
  createProject: (name: string, description?: string, color?: string) =>
    request<any>('/projects', { method: 'POST', body: JSON.stringify({ name, description, color }) }),
  updateProject: (id: string, data: any) =>
    request<any>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<any>(`/projects/${id}`, { method: 'DELETE' }),
  addSessionToProject: (projectId: string, sessionId: string) =>
    request<any>(`/projects/${projectId}/sessions/${sessionId}`, { method: 'POST' }),

  // MCPs
  getInstalledMcps: () => request<any[]>('/mcps/installed'),
  getMcpRegistry: () => request<any[]>('/mcps/registry'),
  installMcp: (name: string, env?: Record<string, string>, args?: string[]) =>
    request<any>('/mcps/install', { method: 'POST', body: JSON.stringify({ name, env, args }) }),
  addMcp: (data: any) => request<any>('/mcps', { method: 'POST', body: JSON.stringify(data) }),
  updateMcp: (name: string, data: { env?: Record<string, string>; args?: string[] }) =>
    request<any>(`/mcps/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeMcp: (name: string) => request<any>(`/mcps/${name}`, { method: 'DELETE' }),

  // Dynamic Marketplace
  getMarketplace: (params?: { query?: string; transport?: string; page?: number; pageSize?: number }) => {
    const sp = new URLSearchParams();
    if (params?.query) sp.set('query', params.query);
    if (params?.transport) sp.set('transport', params.transport);
    if (params?.page) sp.set('page', String(params.page));
    if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
    const qs = sp.toString();
    return request<{ servers: any[]; total: number; page: number; pageSize: number }>(
      `/mcps/marketplace${qs ? `?${qs}` : ''}`
    );
  },
  installFromMarketplace: (server: {
    id: string; transport: string; remoteUrl?: string; remoteType?: string; npmPackage?: string;
  }) => request<{ success: boolean; message: string }>(
    '/mcps/marketplace/install',
    { method: 'POST', body: JSON.stringify(server) }
  ),

  // Agents (Claude Code subagents)
  getAgents: () => request<any[]>('/agents'),
  getAgent: (name: string) => request<any>(`/agents/${name}`),
  createAgent: (data: any) => request<any>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (name: string, data: any) => request<any>(`/agents/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgent: (name: string) => request<any>(`/agents/${name}`, { method: 'DELETE' }),

  // Workflow definitions
  getWorkflows: () => request<any[]>('/workflows'),
  getWorkflow: (id: string) => request<any>(`/workflows/${id}`),
  createWorkflow: (data: any) => request<any>('/workflows', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkflow: (id: string, data: any) => request<any>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWorkflow: (id: string) => request<any>(`/workflows/${id}`, { method: 'DELETE' }),

  // Workflow execution
  runWorkflow: (workflowId: string, input: string, model?: string) =>
    request<{ runId: string; status: string }>(`/workflows/${workflowId}/run`, {
      method: 'POST', body: JSON.stringify({ input, model }),
    }),
  completeWorkflowStep: (runId: string, stepId: string) =>
    request<any>(`/workflows/runs/${runId}/steps/${stepId}/complete`, { method: 'POST' }),
  getWorkflowRuns: () => request<any[]>('/workflows/runs'),
  getWorkflowRun: (id: string) => request<any>(`/workflows/runs/${id}`),
  deleteWorkflowRun: (id: string) => request<any>(`/workflows/runs/${id}`, { method: 'DELETE' }),

  // Templates
  getTemplates: () => request<any[]>('/templates'),

  // Providers
  getProviders: () => request<any>('/providers'),

  // Settings
  getClaudeSettings: () => request<any>('/settings/claude'),
};
