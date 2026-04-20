export interface ProviderConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  healthCheck: string;
  models: ModelInfo[];
  defaultModel: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export interface SessionMetadata {
  id: string;
  name: string;
  providerId: string;
  model: string;
  projectId: string | null;
  status: 'starting' | 'idle' | 'busy' | 'error' | 'stopped';
  cwd: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  lastActivityAt: string;
  agentTemplate: string | null;
  systemPrompt: string | null;
  thinkingEnabled: boolean;
  tags: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface McpServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  status?: 'configured' | 'running' | 'error';
  transport?: 'stdio' | 'http' | 'sse';
  url?: string;
}

// ── Claude Code Subagent types ───────────────────────────────────────────

export interface Agent {
  name: string;
  description: string;
  model: string;
  tools: string[];
  mcpServers: string[];
  systemPrompt: string;
}

export interface AgentInput {
  name: string;
  description: string;
  model?: string;
  tools?: string[];
  mcpServers?: string[];
  systemPrompt: string;
}

// ── Official MCP Registry API types ──────────────────────────────────────

export interface McpMarketplaceServer {
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
  source: 'registry' | 'curated';
}

export interface McpSetupField {
  key: string;
  type: 'env' | 'args';
  label: string;
  description: string;
  placeholder?: string;
  helpUrl?: string;
  required: boolean;
  secret: boolean;
}

export interface McpSetup {
  instructions?: string;
  fields: McpSetupField[];
}

export interface McpRegistryEntry {
  name: string;
  description: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  category: string;
  installCmd: string;
  setup?: McpSetup;
}

export interface StreamEvent {
  type: string;
  subtype?: string;
  message?: any;
  content?: any;
  session_id?: string;
  total_cost_usd?: number;
  is_error?: boolean;
  result?: any;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface CreateSessionOpts {
  name?: string;
  providerId?: string;
  model?: string;
  cwd?: string;
  projectId?: string;
  agentTemplate?: string;
  systemPrompt?: string;
  maxBudgetUsd?: number;
  mcpConfig?: string;
  permissionMode?: string;
  initialPrompt?: string;
  tags?: string[];
}

// ── Workflow definitions (persisted to data/workflows/) ──────────────────

export interface WorkflowStepDef {
  id: string;
  name: string;
  prompt: string;
  model: string;
  dependsOn: string[];
  agent?: string;
}

export interface SavedWorkflow {
  id: string;
  name: string;
  description: string;
  color: string;
  steps: WorkflowStepDef[];
  isPreset: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Workflow runs (persisted to data/workflow-runs/) ─────────────────────

export interface WorkflowStepResult {
  sessionId: string;
  text: string;
  status: 'pending' | 'active' | 'done' | 'error';
  costUsd: number;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  name: string;
  input: string;
  projectId?: string;
  steps: WorkflowStepDef[];
  status: 'running' | 'completed' | 'error';
  stepResults: Record<string, WorkflowStepResult>;
  totalCostUsd: number;
  startedAt: string;
  completedAt?: string;
}

export type ClientMessage =
  | { type: 'session:subscribe'; sessionId: string }
  | { type: 'session:unsubscribe'; sessionId: string }
  | { type: 'session:send'; sessionId: string; content: string }
  | { type: 'session:create'; opts: CreateSessionOpts }
  | { type: 'session:kill'; sessionId: string }
  | { type: 'session:replay'; sessionId: string; fromIndex?: number };

export type ServerMessage =
  | { type: 'session:event'; sessionId: string; event: StreamEvent; index: number }
  | { type: 'session:status'; sessionId: string; status: string; metadata?: Partial<SessionMetadata> }
  | { type: 'session:created'; session: SessionMetadata }
  | { type: 'session:error'; sessionId: string; error: string }
  | { type: 'error'; message: string };
