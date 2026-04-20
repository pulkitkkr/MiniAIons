import { create } from 'zustand';

export interface ParsedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  blocks: ContentBlock[];
  timestamp: string;
  costUsd?: number;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any; result?: string; status: 'pending' | 'success' | 'error' }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean };

export interface SessionState {
  id: string;
  name: string;
  model: string;
  provider: string;
  status: string;
  messages: ParsedMessage[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  projectId: string | null;
  createdAt: string;
  systemPrompt?: string | null;
  thinkingEnabled?: boolean;
  availableTools?: string[];
  mcpServers?: any[];
  availableSkills?: string[];
  activeModel?: string;
  [key: string]: any;
}

interface SessionStore {
  sessions: Record<string, SessionState>;
  activeSessionId: string | null;
  openTabs: string[];

  setActiveSession: (id: string | null) => void;
  openTab: (id: string) => void;
  closeTab: (id: string) => void;
  upsertSession: (id: string, data: Partial<SessionState>) => void;
  removeSession: (id: string) => void;
  appendEvent: (sessionId: string, event: any) => void;
}

function parseBlocks(content: any[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const block of content || []) {
    if (block.type === 'text' && block.text) {
      blocks.push({ type: 'text', text: block.text });
    } else if (block.type === 'thinking') {
      blocks.push({ type: 'thinking', text: block.thinking || '' });
    } else if (block.type === 'tool_use') {
      blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input, status: 'pending' });
    } else if (block.type === 'tool_result') {
      const content = typeof block.content === 'string' ? block.content :
        Array.isArray(block.content) ? block.content.map((c: any) => c.text || '').join('\n') :
        JSON.stringify(block.content);
      blocks.push({ type: 'tool_result', toolUseId: block.tool_use_id, content, isError: block.is_error });
    }
  }
  return blocks;
}

/**
 * Upsert a message by ID into the messages array.
 * If a message with the same ID exists, REPLACE its blocks (handles streaming partials).
 * If not, append it.
 */
function upsertMessage(messages: ParsedMessage[], newMsg: ParsedMessage): ParsedMessage[] {
  const idx = messages.findIndex((m) => m.id === newMsg.id);
  if (idx !== -1) {
    // Replace blocks — streaming sends updated content for same message ID
    const updated = [...messages];
    updated[idx] = { ...updated[idx], blocks: newMsg.blocks };
    return updated;
  }
  return [...messages, newMsg];
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  openTabs: [],

  setActiveSession: (id) => set({ activeSessionId: id }),

  openTab: (id) => {
    const tabs = get().openTabs;
    if (!tabs.includes(id)) {
      set({ openTabs: [...tabs, id], activeSessionId: id });
    } else {
      set({ activeSessionId: id });
    }
  },

  closeTab: (id) => {
    const { openTabs, activeSessionId } = get();
    const newTabs = openTabs.filter((t) => t !== id);
    const newActive = activeSessionId === id ? newTabs[newTabs.length - 1] || null : activeSessionId;
    set({ openTabs: newTabs, activeSessionId: newActive });
  },

  upsertSession: (id, data) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: { ...state.sessions[id], ...data, id } as SessionState,
      },
    }));
  },

  removeSession: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.sessions;
      return {
        sessions: rest,
        openTabs: state.openTabs.filter((t) => t !== id),
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      };
    });
  },

  appendEvent: (sessionId, event) => {
    if (!event || !event.type) return;

    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const updates: Partial<SessionState> = {};

      // Handle assistant messages — upsert by message ID to prevent duplicates
      if (event.type === 'assistant' && event.message) {
        const msg = event.message;
        const blocks = parseBlocks(msg.content);
        if (blocks.length) {
          const msgId = msg.id || crypto.randomUUID();
          const parsed: ParsedMessage = {
            id: msgId,
            role: 'assistant',
            blocks,
            timestamp: new Date().toISOString(),
          };
          updates.messages = upsertMessage(session.messages, parsed);
        }
      }

      // Handle user messages — tool results get merged into parent tool_use cards
      if (event.type === 'user' && event.message) {
        const msg = event.message;
        const blocks = parseBlocks(msg.content);
        if (!blocks.length) { /* skip */ }
        else {
          const toolResultBlocks = blocks.filter((b) => b.type === 'tool_result');
          const textBlocks = blocks.filter((b) => b.type === 'text');

          // If this message is ONLY tool results, merge them into the parent assistant message's tool_use blocks
          if (toolResultBlocks.length > 0 && textBlocks.length === 0) {
            const msgs = updates.messages || [...session.messages];
            // Walk backwards to find the assistant message containing matching tool_use blocks
            for (let mi = msgs.length - 1; mi >= 0; mi--) {
              if (msgs[mi].role !== 'assistant') continue;
              let modified = false;
              const updatedBlocks = msgs[mi].blocks.map((b) => {
                if (b.type !== 'tool_use') return b;
                const matchingResult = toolResultBlocks.find(
                  (tr) => tr.type === 'tool_result' && tr.toolUseId === b.id
                );
                if (matchingResult && matchingResult.type === 'tool_result') {
                  modified = true;
                  return { ...b, result: matchingResult.content, status: matchingResult.isError ? 'error' as const : 'success' as const };
                }
                return b;
              });
              if (modified) {
                const updatedMsgs = [...msgs];
                updatedMsgs[mi] = { ...msgs[mi], blocks: updatedBlocks };
                updates.messages = updatedMsgs;
                break;
              }
            }
          } else if (textBlocks.length > 0) {
            // Real user message with text — show it normally
            const msgId = msg.id || crypto.randomUUID();
            updates.messages = upsertMessage(updates.messages || session.messages, {
              id: msgId,
              role: 'user',
              blocks: textBlocks, // only the text blocks, not tool_results
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      // Handle result events (cost/token tracking)
      if (event.type === 'result') {
        if (event.total_cost_usd !== undefined) updates.costUsd = event.total_cost_usd;
        if (event.usage) {
          updates.inputTokens = (session.inputTokens || 0) + (event.usage.input_tokens || 0);
          updates.outputTokens = (session.outputTokens || 0) + (event.usage.output_tokens || 0);
        }
        updates.status = event.is_error ? 'error' : 'idle';
      }

      // Handle system init (capture tools/MCPs)
      if (event.type === 'system' && event.subtype === 'init') {
        if (event.tools) updates.availableTools = event.tools;
        if (event.mcp_servers) updates.mcpServers = event.mcp_servers;
        if (event.model) updates.activeModel = event.model;
        if (event.skills) updates.availableSkills = event.skills;
      }

      if (Object.keys(updates).length === 0) return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, ...updates },
        },
      };
    });
  },
}));
