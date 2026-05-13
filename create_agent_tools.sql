CREATE TABLE IF NOT EXISTS agent_tools (
  id TEXT PRIMARY KEY,
  agentId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  config TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agentId);
CREATE INDEX IF NOT EXISTS idx_agent_tools_type ON agent_tools(type);
CREATE INDEX IF NOT EXISTS idx_agent_tools_enabled ON agent_tools(enabled);