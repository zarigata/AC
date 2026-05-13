import crypto from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inspect } from "node:util";

const sanitizeContent = (content, fieldName = 'content') => {
  if (typeof content !== 'string') {
    if (content === null || content === undefined) {
      return '';
    }
    throw new Error(`${fieldName} must be a string`);
  }
  
  // Remove potentially dangerous HTML/JS content
  let sanitized = content
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>.*?<\/object>/gi, '')
    .replace(/<embed[^>]*>.*?<\/embed>/gi, '')
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<meta[^>]*>.*?<\/meta>/gi, '')
    .replace(/<link[^>]*>.*?<\/link>/gi, '')
    .replace(/on\w+\s*=/gi, '');
  
  // Remove null bytes and control characters
  sanitized = sanitized.replace(/\x00/g, '').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, '');
  
  return sanitized;
};

// Comprehensive input validation
const validateInput = (input, rules, fieldName) => {
  if (!input && input !== '' && input !== 0 && input !== false) {
    throw new Error(`${fieldName} is required`);
  }
  
  for (const [key, rule] of Object.entries(rules)) {
    const value = input[key];
    
    if (rule.required && (value === undefined || value === null || value === '')) {
      throw new Error(`${fieldName}.${key} is required`);
    }
    
    if (value !== undefined && value !== null) {
      if (rule.type && typeof value !== rule.type) {
        throw new Error(`${fieldName}.${key} must be a ${rule.type}`);
      }
      
      if (rule.minLength && value.length < rule.minLength) {
        throw new Error(`${fieldName}.${key} must be at least ${rule.minLength} characters`);
      }
      
      if (rule.maxLength && value.length > rule.maxLength) {
        throw new Error(`${fieldName}.${key} must be no more than ${rule.maxLength} characters`);
      }
      
      if (rule.min !== undefined && Number(value) < rule.min) {
        throw new Error(`${fieldName}.${key} must be at least ${rule.min}`);
      }
      
      if (rule.max !== undefined && Number(value) > rule.max) {
        throw new Error(`${fieldName}.${key} must be no more than ${rule.max}`);
      }
      
      if (rule.enum && !rule.enum.includes(value)) {
        throw new Error(`${fieldName}.${key} must be one of: ${rule.enum.join(', ')}`);
      }
      
      if (rule.pattern && !rule.pattern.test(value)) {
        throw new Error(`${fieldName}.${key} format is invalid`);
      }
    }
  }
  
  return true;
};

import {
  agentLinkModeValues,
  parseAgent,
  parseCreateAgentInput,
  parseCreateLinkInput
} from "./shared/simpleShared.js";

const now = () => new Date().toISOString();

export class AgentRegistry {
  constructor(options) {
    try {
      // Validate database path
      if (!options.databasePath) {
        throw new Error('Database path is required');
      }
      
      // Ensure directory exists with proper permissions
      const dbDir = dirname(options.databasePath);
      mkdirSync(dbDir, { recursive: true, mode: 0o755 });
      
      // Initialize database with error handling
      try {
        this.db = new DatabaseSync(options.databasePath);
        
        // Enable foreign key constraints
        this.db.exec('PRAGMA foreign_keys = ON');
        
        // Create tables with proper indexes
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            purpose TEXT NOT NULL,
            systemPrompt TEXT DEFAULT NULL,
            status TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            isolationMode TEXT NOT NULL,
            maxConcurrentTasks INTEGER NOT NULL,
            peerAccess INTEGER NOT NULL,
            toolsConfig TEXT DEFAULT NULL, -- JSON config defining available tools
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
          CREATE INDEX IF NOT EXISTS idx_agents_provider ON agents(provider);
          CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(createdAt);
          
          CREATE TABLE IF NOT EXISTS agent_tools (
            id TEXT PRIMARY KEY,
            agentId TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL, -- 'web_search', 'exec', 'read', 'write', 'calculate', etc.
            description TEXT NOT NULL,
            config TEXT DEFAULT NULL, -- JSON configuration for the tool
            enabled BOOLEAN NOT NULL DEFAULT 1,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agentId);
          CREATE INDEX IF NOT EXISTS idx_agent_tools_type ON agent_tools(type);
          CREATE INDEX IF NOT EXISTS idx_agent_tools_enabled ON agent_tools(enabled);
        `);

        this.db.exec(`
          CREATE TABLE IF NOT EXISTS agent_links (
            sourceAgentId TEXT NOT NULL,
            targetAgentId TEXT NOT NULL,
            mode TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            PRIMARY KEY (sourceAgentId, targetAgentId),
            FOREIGN KEY (sourceAgentId) REFERENCES agents(id) ON DELETE CASCADE,
            FOREIGN KEY (targetAgentId) REFERENCES agents(id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_links_source ON agent_links(sourceAgentId);
          CREATE INDEX IF NOT EXISTS idx_links_target ON agent_links(targetAgentId);
        `);

        this.db.exec(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            agentId TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agentId);
          CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(createdAt);
          CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updatedAt);
        `);

        this.db.exec(`
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            sessionId TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            tokensIn INTEGER NOT NULL DEFAULT 0,
            tokensOut INTEGER NOT NULL DEFAULT 0,
            model TEXT NOT NULL DEFAULT '',
            createdAt TEXT NOT NULL,
            FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(sessionId);
          CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
          CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(createdAt);
        `);

        this.db.exec(`
          CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            status INTEGER NOT NULL,
            duration INTEGER NOT NULL,
            userAgent TEXT,
            ip TEXT,
            createdAt TEXT NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_logs_status ON logs(status);
          CREATE INDEX IF NOT EXISTS idx_logs_path ON logs(path);
          CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(createdAt);
        `);

        this.db.exec(`
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            data TEXT,
            result TEXT,
            error TEXT,
            createdAt TEXT NOT NULL,
            startedAt TEXT,
            completedAt TEXT
          );
          
          CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
          CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
          CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(createdAt);
          CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs(status, createdAt);
        `);
        
        // Enable WAL mode for better performance
        this.db.exec('PRAGMA journal_mode = WAL');
        this.db.exec('PRAGMA synchronous = NORMAL');
        
      } catch (dbErr) {
        throw new Error(`Database initialization failed: ${dbErr.message}`);
      }
    } catch (initErr) {
      throw new Error(`Registry initialization failed: ${initErr.message}`);
    }
  }

  seed() {
    if (this.listAgents().length > 0) {
      return;
    }

    const coordinator = this.createAgent({
      name: "Coordinator",
      purpose: "Break work into tasks, supervise runs, and route model usage.",
      provider: "openai",
      model: "gpt-5.4",
      isolationMode: "isolated",
      maxConcurrentTasks: 8,
      peerAccess: false,
    });

    const researcher = this.createAgent({
      name: "Researcher",
      purpose: "Research and summarize the web",
      provider: "openai",
      model: "gpt-5.4",
      isolationMode: "isolated",
      maxConcurrentTasks: 8,
      peerAccess: false,
    });

    this.createLink({
      sourceAgentId: coordinator.id,
      targetAgentId: researcher.id,
      mode: "delegate"
    });
  }

  createAgent(input) {
    try {
      // Validate input structure with comprehensive rules
      if (!input || typeof input !== 'object') {
        throw new Error('Invalid input: must be an object');
      }
      
      // Use comprehensive input validation
      validateInput(input, {
        name: { required: true, type: 'string', minLength: 2, maxLength: 80 },
        purpose: { required: true, type: 'string', minLength: 10, maxLength: 240 },
        systemPrompt: { required: false, type: 'string', minLength: 0, maxLength: 2000 },
        toolsConfig: { required: false, type: 'object' },
        provider: { required: true, type: 'string', minLength: 2, maxLength: 80 },
        model: { required: true, type: 'string', minLength: 2, maxLength: 120 },
        isolationMode: { required: true, type: 'string', enum: ['isolated', 'selective', 'mesh'] },
        maxConcurrentTasks: { required: true, type: 'number', min: 1, max: 32 },
        peerAccess: { required: true, type: 'boolean' }
      }, 'Agent input');

      // Check for reserved names
      if (input.name.toLowerCase().includes('admin') || 
          input.name.toLowerCase().includes('system') || 
          input.name.toLowerCase().includes('root')) {
        throw new Error('Invalid agent name: reserved name not allowed');
      }
      
      // Check agent limit with error handling
      const currentAgents = this.listAgents();
      if (currentAgents.length >= 100) {
        throw new Error("This machine already has 100 registered agents.");
      }

      const parsed = parseCreateAgentInput(input);
      const id = crypto.randomUUID();
      const timestamp = now();
      const agent = {
        id,
        status: "idle",
        createdAt: timestamp,
        updatedAt: timestamp,
        systemPrompt: input.systemPrompt || null,
        toolsConfig: input.toolsConfig ? JSON.stringify(input.toolsConfig) : null,
        ...parsed
      };

      // Sanitize inputs
      agent.name = sanitizeContent(agent.name, 'agent name').trim();
      agent.purpose = sanitizeContent(agent.purpose, 'agent purpose').trim();
      
      // Begin transaction for data consistency
      this.db.exec('BEGIN TRANSACTION');
      try {
        const insertStmt = this.db.prepare(
          `
            INSERT INTO agents (
              id, name, purpose, systemPrompt, status, provider, model, isolationMode,
              maxConcurrentTasks, peerAccess, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        );

        const result = insertStmt.run(
          agent.id,
          agent.name,
          agent.purpose,
          agent.systemPrompt,
          agent.status,
          agent.provider,
          agent.model,
          agent.isolationMode,
          agent.maxConcurrentTasks,
          Number(agent.peerAccess),
          agent.createdAt,
          agent.updatedAt
        );

        if (result.changes === 0) {
          throw new Error('Failed to create agent');
        }
        
        this.db.exec('COMMIT');
        return agent;
      } catch (dbErr) {
        this.db.exec('ROLLBACK');
        console.error('Database error creating agent:', dbErr);
        throw new Error('Database operation failed');
      }
    } catch (err) {
      console.error('Error creating agent:', err);
      // Preserve specific error messages for important cases
      if (err.message.includes('100 registered agents')) {
        throw new Error('This machine already has 100 registered agents.');
      }
      // Sanitize error message for client
      const errorMessage = err.message.includes('database') ? 'Database operation failed' : 
                          err.message.includes('validation') ? 'Invalid input data' : 'Failed to create agent';
      throw new Error(errorMessage);
    }
  }

  listAgents(limit = 100) {
    try {
      // Enforce reasonable limit
      const safeLimit = Math.min(Math.max(Number(limit), 1), 1000);
      
      const rows = this.db
        .prepare("SELECT * FROM agents ORDER BY createdAt DESC LIMIT ?")
        .all(safeLimit);

      return rows.map((row) =>
        parseAgent({
          ...row,
          peerAccess: Boolean(row.peerAccess)
        })
      );
    } catch (err) {
      console.error('Error listing agents:', err);
      return [];
    }
  }

  getAgent(id) {
    try {
      // Validate ID format
      if (!id || typeof id !== 'string' || id.length > 64) {
        return null;
      }
      
      const row = this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
      if (!row) return null;
      
      return parseAgent({ ...row, peerAccess: Boolean(row.peerAccess) });
    } catch (err) {
      console.error('Error getting agent:', err);
      return null;
    }
  }

  updateAgent(id, updates) {
    try {
      // Validate ID format
      if (!id || typeof id !== 'string' || id.length > 64) {
        return null;
      }
      
      const existing = this.getAgent(id);
      if (!existing) return null;

      const allowed = ["name", "purpose", "systemPrompt", "toolsConfig", "status", "provider", "model", "isolationMode", "maxConcurrentTasks", "peerAccess"];
      const fields = [];
      const values = [];

      // Validate and sanitize updates
      for (const key of allowed) {
        if (key in updates) {
          let value = updates[key];
          
          // Type validation
          if (key === "peerAccess" && typeof value !== "boolean") {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === "maxConcurrentTasks" && (!Number.isInteger(value) || value < 1 || value > 32)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === "name" && (typeof value !== "string" || value.length > 80)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === "purpose" && (typeof value !== "string" || value.length > 240)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === "systemPrompt" && (typeof value !== "string" || value.length > 2000)) {
            throw new Error(`Invalid ${key} value: must be no more than 2000 characters`);
          }
          
          if (key === "toolsConfig") {
            if (value !== null && typeof value !== "object") {
              throw new Error(`Invalid ${key} value: must be an object or null`);
            }
            // Store as JSON string
            value = value ? JSON.stringify(value) : null;
          }
          
          fields.push(`${key} = ?`);
          values.push(key === "peerAccess" ? Number(value) : value);
        }
      }

      if (fields.length === 0) return existing;

      fields.push("updatedAt = ?");
      values.push(now());
      values.push(id);

      const updateStmt = this.db.prepare(`UPDATE agents SET ${fields.join(", ")} WHERE id = ?`);
      const result = updateStmt.run(...values);
      
      if (result.changes === 0) {
        return null;
      }
      
      return this.getAgent(id);
    } catch (err) {
      console.error('Error updating agent:', err);
      throw err;
    }
  }

  deleteAgent(id) {
    try {
      // Validate ID format
      if (!id || typeof id !== 'string' || id.length > 64) {
        return false;
      }
      
      const existing = this.getAgent(id);
      if (!existing) return false;
      
      // Begin transaction for safe deletion
      this.db.exec('BEGIN TRANSACTION');
      try {
        // Delete dependent records first (foreign key constraints will handle this)
        this.db.prepare("DELETE FROM agent_links WHERE sourceAgentId = ? OR targetAgentId = ?").run(id, id);
        this.db.prepare("DELETE FROM sessions WHERE agent_id = ?").run(id);
        
        // Delete the agent
        const result = this.db.prepare("DELETE FROM agents WHERE id = ?").run(id);
        
        this.db.exec('COMMIT');
        return result.changes > 0;
      } catch (deleteErr) {
        this.db.exec('ROLLBACK');
        console.error('Error deleting agent:', deleteErr);
        throw deleteErr;
      }
    } catch (err) {
      console.error('Error deleting agent:', err);
      return false;
    }
  }

  // Agent Tools/Skills Management Methods
  
  /**
   * Get all tools for an agent
   */
  getAgentTools(agentId) {
    try {
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return [];
      }
      
      const tools = this.db
        .prepare("SELECT * FROM agent_tools WHERE agentId = ? AND enabled = 1 ORDER BY createdAt ASC")
        .all(agentId);
      
      // Parse config JSON if present
      return tools.map(tool => ({
        ...tool,
        config: tool.config ? JSON.parse(tool.config) : null
      }));
    } catch (err) {
      console.error('Error getting agent tools:', err);
      return [];
    }
  }
  
  /**
   * Add a tool to an agent
   */
  addAgentTool(agentId, toolData) {
    try {
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        throw new Error('Invalid agent ID');
      }
      
      // Check if agent exists
      const agent = this.getAgent(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }
      
      // Validate tool data
      if (!toolData.name || typeof toolData.name !== 'string') {
        throw new Error('Tool name is required');
      }
      
      if (!toolData.type || typeof toolData.type !== 'string') {
        throw new Error('Tool type is required');
      }
      
      const allowedTypes = ['web_search', 'exec', 'read', 'write', 'calculate', 'api_call', 'file_system', 'database'];
      if (!allowedTypes.includes(toolData.type)) {
        throw new Error(`Invalid tool type. Must be one of: ${allowedTypes.join(', ')}`);
      }
      
      const id = crypto.randomUUID();
      const timestamp = now();
      const tool = {
        id,
        agentId,
        name: toolData.name.trim(),
        type: toolData.type,
        description: toolData.description || '',
        config: toolData.config ? JSON.stringify(toolData.config) : null,
        enabled: toolData.enabled !== undefined ? Boolean(toolData.enabled) : true,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      
      const insertStmt = this.db.prepare(
        "INSERT INTO agent_tools (id, agentId, name, type, description, config, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      );
      
      insertStmt.run(
        tool.id, tool.agentId, tool.name, tool.type, tool.description, 
        tool.config, tool.enabled ? 1 : 0, tool.createdAt, tool.updatedAt
      );
      
      return {
        ...tool,
        config: tool.config ? JSON.parse(tool.config) : null
      };
    } catch (err) {
      console.error('Error adding agent tool:', err);
      throw err;
    }
  }
  
  /**
   * Update an agent's tool
   */
  updateAgentTool(agentId, toolId, updates) {
    try {
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        throw new Error('Invalid agent ID');
      }
      
      if (!toolId || typeof toolId !== 'string' || toolId.length > 64) {
        throw new Error('Invalid tool ID');
      }
      
      // Check if tool exists and belongs to agent
      const existing = this.db.prepare("SELECT * FROM agent_tools WHERE id = ? AND agentId = ?").get(toolId, agentId);
      if (!existing) {
        throw new Error('Tool not found');
      }
      
      const allowed = ["name", "type", "description", "config", "enabled"];
      const fields = [];
      const values = [];
      
      // Validate and sanitize updates
      for (const key of allowed) {
        if (key in updates) {
          let value = updates[key];
          
          if (key === "name" && (typeof value !== "string" || value.length > 100)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === "type") {
            const allowedTypes = ['web_search', 'exec', 'read', 'write', 'calculate', 'api_call', 'file_system', 'database'];
            if (!allowedTypes.includes(value)) {
              throw new Error(`Invalid tool type. Must be one of: ${allowedTypes.join(', ')}`);
            }
          }
          
          if (key === "description" && (typeof value !== "string" || value.length > 500)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === "config") {
            if (value !== null && typeof value !== "object") {
              throw new Error(`Invalid ${key} value: must be an object or null`);
            }
            value = value ? JSON.stringify(value) : null;
          }
          
          if (key === "enabled") {
            value = Boolean(value) ? 1 : 0;
          }
          
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }
      
      if (fields.length === 0) return existing;
      
      fields.push("updatedAt = ?");
      values.push(now());
      values.push(toolId);
      
      const updateStmt = this.db.prepare(`UPDATE agent_tools SET ${fields.join(", ")} WHERE id = ?`);
      const result = updateStmt.run(...values);
      
      if (result.changes === 0) {
        throw new Error('Failed to update tool');
      }
      
      // Return updated tool
      const updated = this.db.prepare("SELECT * FROM agent_tools WHERE id = ?").get(toolId);
      return {
        ...updated,
        config: updated.config ? JSON.parse(updated.config) : null
      };
    } catch (err) {
      console.error('Error updating agent tool:', err);
      throw err;
    }
  }
  
  /**
   * Delete an agent's tool
   */
  deleteAgentTool(agentId, toolId) {
    try {
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return false;
      }
      
      if (!toolId || typeof toolId !== 'string' || toolId.length > 64) {
        return false;
      }
      
      // Check if tool exists and belongs to agent
      const existing = this.db.prepare("SELECT * FROM agent_tools WHERE id = ? AND agentId = ?").get(toolId, agentId);
      if (!existing) {
        return false;
      }
      
      const result = this.db.prepare("DELETE FROM agent_tools WHERE id = ? AND agentId = ?").run(toolId, agentId);
      
      return result.changes > 0;
    } catch (err) {
      console.error('Error deleting agent tool:', err);
      return false;
    }
  }
  
  /**
   * Get default tools configuration
   */
  getDefaultTools() {
    return {
      web_search: {
        name: "Web Search",
        type: "web_search",
        description: "Search the web for information",
        config: {
          engine: "duckduckgo", // duckduckgo, google, bing
          maxResults: 10,
          timeout: 30000
        }
      },
      exec: {
        name: "Command Execution",
        type: "exec", 
        description: "Execute shell commands in a safe sandbox",
        config: {
          timeout: 30000,
          allowedCommands: ["ls", "cat", "pwd", "whoami", "echo", "ps"],
          workingDirectory: "/tmp"
        }
      },
      read: {
        name: "File Reader",
        type: "read",
        description: "Read text files from the filesystem",
        config: {
          allowedPaths: ["/tmp", "/home", "/app"],
          maxSize: 1024 * 1024 // 1MB
        }
      },
      write: {
        name: "File Writer", 
        type: "write",
        description: "Write text files to the filesystem",
        config: {
          allowedPaths: ["/tmp", "/home/user", "/app/data"],
          maxSize: 1024 * 1024 // 1MB
        }
      },
      calculate: {
        name: "Calculator",
        type: "calculate", 
        description: "Perform mathematical calculations",
        config: {
          precision: 10,
          maxOperations: 100
        }
      }
    };
  }
  
  listLinks() {
    try {
      return this.db
        .prepare("SELECT * FROM agent_links ORDER BY createdAt ASC LIMIT 1000")
        .all();
    } catch (err) {
      console.error('Error listing links:', err);
      return [];
    }
  }

  createLink(input) {
    try {
      const parsed = parseCreateLinkInput(input);

      // Prevent self-links
      if (parsed.sourceAgentId === parsed.targetAgentId) {
        throw new Error("An agent cannot create a link to itself.");
      }

      // Check if both agents exist
      const agentIds = new Set(this.listAgents().map((agent) => agent.id));
      if (!agentIds.has(parsed.sourceAgentId) || !agentIds.has(parsed.targetAgentId)) {
        throw new Error("Both agents must exist before creating a link.");
      }

      const createdAt = now();
      const insertStmt = this.db.prepare(
        `
          INSERT OR REPLACE INTO agent_links (
            sourceAgentId, targetAgentId, mode, createdAt
          ) VALUES (?, ?, ?, ?)
        `
      );

      const result = insertStmt.run(parsed.sourceAgentId, parsed.targetAgentId, parsed.mode, createdAt);

      if (result.changes === 0) {
        throw new Error('Failed to create link');
      }

      return {
        ...parsed,
        createdAt
      };
    } catch (err) {
      console.error('Error creating link:', err);
      throw err;
    }
  }

  deleteLink(input) {
    try {
      // Support both object and parameter calls
      const sourceAgentId = input.sourceAgentId;
      const targetAgentId = input.targetAgentId;
      
      // Validate ID formats
      if (!sourceAgentId || typeof sourceAgentId !== 'string' || sourceAgentId.length > 64) {
        return false;
      }
      
      if (!targetAgentId || typeof targetAgentId !== 'string' || targetAgentId.length > 64) {
        return false;
      }
      
      const deleteStmt = this.db.prepare(
        "DELETE FROM agent_links WHERE sourceAgentId = ? AND targetAgentId = ?"
      );
      const result = deleteStmt.run(sourceAgentId, targetAgentId);
      
      return result.changes > 0;
    } catch (err) {
      console.error('Error deleting link:', err);
      return false;
    }
  }

  createSession(agentId, input = {}) {
    try {
      // Validate agent ID format
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return null;
      }
      
      const agent = this.getAgent(agentId);
      if (!agent) return null;

      const id = crypto.randomUUID();
      const timestamp = now();
      const session = {
        id,
        agentId,
        title: input.title ? String(input.title).substring(0, 200) : "New session",
        model: input.model ? String(input.model).substring(0, 120) : agent.model,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      // Validate session data
      if (!session.title || typeof session.title !== 'string') {
        throw new Error('Invalid session title');
      }
      
      if (!session.model || typeof session.model !== 'string') {
        throw new Error('Invalid session model');
      }

      const insertStmt = this.db.prepare("INSERT INTO sessions (id, agent_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
      const result = insertStmt.run(session.id, session.agentId, session.title, session.model, session.createdAt, session.updatedAt);
      
      if (result.changes === 0) {
        throw new Error('Failed to create session');
      }

      return session;
    } catch (err) {
      console.error('Error creating session:', err);
      throw err;
    }
  }

  updateSession(sessionId, updates) {
    try {
      // Validate session ID format
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
        return null;
      }
      
      // Get existing session
      const existing = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
      if (!existing) return null;

      const allowed = ["title", "model"];
      const fields = [];
      const values = [];

      // Validate and sanitize updates
      for (const key of allowed) {
        if (key in updates) {
          let value = updates[key];
          
          if (key === "title" && (typeof value !== "string" || value.length > 200)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === "model" && (typeof value !== "string" || value.length > 120)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (fields.length === 0) return existing;

      fields.push("updatedAt = ?");
      values.push(now());
      values.push(sessionId);

      const updateStmt = this.db.prepare(`UPDATE sessions SET ${fields.join(", ")} WHERE id = ?`);
      const result = updateStmt.run(...values);
      
      if (result.changes === 0) {
        return null;
      }
      
      return this.getSession(sessionId);
    } catch (err) {
      console.error('Error updating session:', err);
      throw err;
    }
  }

  deleteSession(sessionId) {
    try {
      // Validate session ID format
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
        return false;
      }
      
      const result = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
      
      // Also delete all messages in this session
      this.db.prepare("DELETE FROM messages WHERE sessionId = ?").run(sessionId);
      
      return result.changes > 0;
    } catch (err) {
      console.error('Error deleting session:', err);
      return false;
    }
  }

  listSessions(agentId, options = {}) {
    try {
      // Validate agent ID format
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return [];
      }
      
      // Apply pagination with defaults
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(Math.max(options.limit || 50, 1), 100); // Max 100 per page
      const offset = (page - 1) * limit;
      
      // Get total count for pagination metadata
      const countResult = this.db.prepare("SELECT COUNT(*) as total FROM sessions WHERE agent_id = ?").get(agentId);
      const total = countResult.total;
      
      // Get paginated results
      const sessions = this.db
        .prepare("SELECT * FROM sessions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
        .all(agentId, limit, offset);
      
      return {
        sessions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      };
    } catch (err) {
      console.error('Error listing sessions:', err);
      return { sessions: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };
    }
  }

  getSession(sessionId) {
    try {
      // Validate session ID format
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
        return null;
      }
      
      const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
      if (!row) return null;
      
      return row;
    } catch (err) {
      console.error('Error getting session:', err);
      return null;
    }
  }

  createMessage(agentId, sessionId, input) {
    try {
      // Validate agent and session ID formats with additional checks
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64 || agentId.length < 1) {
        throw new Error('Invalid agent ID');
      }
      
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64 || sessionId.length < 1) {
        throw new Error('Invalid session ID');
      }
      
      // Verify session belongs to agent
      const session = this.db.prepare("SELECT * FROM sessions WHERE id = ? AND agent_id = ?").get(sessionId, agentId);
      if (!session) {
        console.error('Session not found:', { agentId, sessionId });
        return null;
      }

      const id = crypto.randomUUID();
      const timestamp = now();
      
      // Validate message input with comprehensive rules
      validateInput(input, {
        role: { required: true, type: 'string', enum: ['user', 'assistant', 'system'] },
        content: { required: true, type: 'string', minLength: 1, maxLength: 50000 },
        tokensIn: { required: false, type: 'number', min: 0, max: 1000000 },
        tokensOut: { required: false, type: 'number', min: 0, max: 1000000 },
        model: { required: false, type: 'string', maxLength: 120 }
      }, 'Message input');
      
      // Sanitize content with enhanced security
      const content = sanitizeContent(input.content, 'message content');
      
      // Additional security validation
      if (content.length === 0) {
        throw new Error('Message content cannot be empty after sanitization');
      }
      
      // Check for potential injection attacks
      const dangerousPatterns = [
        /eval\(/gi,
        /exec\(/gi,
        /Function\(/gi,
        /setTimeout\s*\(/gi,
        /setInterval\s*\(/gi,
        /document\./gi,
        /window\./gi,
        /global\./gi
      ];
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          throw new Error('Message contains potentially dangerous content');
        }
      }
      
      // Use provided token counts or defaults with validation
      const tokensIn = input.tokensIn || 0;
      const tokensOut = input.tokensOut || 0;
      
      if (!Number.isInteger(tokensIn) || tokensIn < 0 || tokensIn > 1000000) {
        throw new Error('Invalid tokensIn value: must be a positive integer less than 1,000,000');
      }
      
      if (!Number.isInteger(tokensOut) || tokensOut < 0 || tokensOut > 1000000) {
        throw new Error('Invalid tokensOut value: must be a positive integer less than 1,000,000');
      }
      
      const message = {
        id,
        sessionId,
        role: input.role,
        content,
        tokensIn,
        tokensOut,
        model: input.model || session.model,
        createdAt: timestamp
      };

      // Validate model
      if (!message.model || typeof message.model !== 'string' || message.model.length > 120 || message.model.length < 1) {
        throw new Error('Invalid model: must be 1-120 characters');
      }

      // Begin transaction for data consistency
      this.db.exec('BEGIN TRANSACTION');
      try {
        const insertStmt = this.db.prepare("INSERT INTO messages (id, sessionId, role, content, tokensIn, tokensOut, model, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        const result = insertStmt.run(message.id, message.sessionId, message.role, message.content, message.tokensIn, message.tokensOut, message.model, message.createdAt);
        
        if (result.changes === 0) {
          throw new Error('Failed to create message');
        }
        
        // Update session timestamp
        const updateStmt = this.db.prepare("UPDATE sessions SET updatedAt = ? WHERE id = ?");
        const updateResult = updateStmt.run(timestamp, sessionId);
        
        if (updateResult.changes === 0) {
          throw new Error('Failed to update session timestamp');
        }
        
        this.db.exec('COMMIT');
        return message;
      } catch (dbErr) {
        this.db.exec('ROLLBACK');
        console.error('Database error creating message:', dbErr);
        throw new Error('Database operation failed');
      }
    } catch (err) {
      console.error('Error creating message:', err);
      // Sanitize error message for client
      const errorMessage = err.message.includes('database') ? 'Database operation failed' : 
                          err.message.includes('invalid') ? 'Invalid message data' : 'Failed to create message';
      throw new Error(errorMessage);
    }
  }

  listMessages(agentId, sessionId, options = {}) {
    try {
      // Validate agent and session ID formats
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return { messages: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };
      }
      
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
        return { messages: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };
      }
      
      // Apply pagination with defaults
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(Math.max(options.limit || 50, 1), 200); // Max 200 per page for messages
      const offset = (page - 1) * limit;
      
      // Get total count for pagination metadata
      const countResult = this.db.prepare("SELECT COUNT(*) as total FROM messages WHERE sessionId = ? AND sessionId IN (SELECT id FROM sessions WHERE agent_id = ?)").get(sessionId, agentId);
      const total = countResult.total;
      
      // Get paginated results
      const messages = this.db
        .prepare("SELECT * FROM messages WHERE sessionId = ? AND sessionId IN (SELECT id FROM sessions WHERE agent_id = ?) ORDER BY created_at ASC LIMIT ? OFFSET ?")
        .all(sessionId, agentId, limit, offset);
      
      return {
        messages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      };
    } catch (err) {
      console.error('Error listing messages:', err);
      return { messages: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };
    }
  }

  deleteMessage(messageId) {
    try {
      // Validate message ID format
      if (!messageId || typeof messageId !== 'string' || messageId.length > 64) {
        return false;
      }
      
      const result = this.db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
      
      return result.changes > 0;
    } catch (err) {
      console.error('Error deleting message:', err);
      return false;
    }
  }

  logRequest(method, path, status, duration, userAgent = null, ip = null) {
    try {
      // Validate input parameters
      if (!method || !path || typeof status !== 'number' || typeof duration !== 'number') {
        return null;
      }
      
      // Sanitize sensitive data
      const safeUserAgent = userAgent ? String(userAgent).substring(0, 500) : null;
      const safeIp = ip ? String(ip).substring(0, 45) : null; // Max IPv6 length
      const safePath = String(path).substring(0, 500);
      
      const id = crypto.randomUUID();
      const timestamp = now();
      
      const insertStmt = this.db.prepare("INSERT INTO logs (id, method, path, status, duration, userAgent, ip, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      const result = insertStmt.run(id, method, safePath, status, duration, safeUserAgent, safeIp, timestamp);
      
      return result.changes > 0 ? id : null;
    } catch (err) {
      console.error('Error logging request:', err);
      return null;
    }
  }

  getRecentLogs(limit = 100) {
    try {
      // Enforce reasonable limit
      const safeLimit = Math.min(Math.max(Number(limit), 1), 1000);
      return this.db
        .prepare("SELECT * FROM logs ORDER BY createdAt DESC LIMIT ?")
        .all(safeLimit);
    } catch (err) {
      console.error('Error getting recent logs:', err);
      return [];
    }
  }

  getCurrentTaskCount(agentId) {
    try {
      // Validate agent ID format
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return 0;
      }
      
      // This is a placeholder - in a real implementation, you'd track actual task execution
      // For now, return a simulated count based on recent activity
      const recentSessions = this.db
        .prepare("SELECT id FROM sessions WHERE agent_id = ? AND datetime(updated_at) > datetime('now', '-5 minutes')")
        .all(agentId);
      
      let totalMessages = 0;
      for (const session of recentSessions) {
        const messageCount = this.db
          .prepare("SELECT COUNT(*) as count FROM messages WHERE sessionId = ? AND datetime(createdAt) > datetime('now', '-5 minutes')")
          .get(session.id).count;
        totalMessages += messageCount;
      }
      
      return Math.max(0, totalMessages - recentSessions.length); // Subtract user messages
    } catch (err) {
      console.error('Error getting current task count:', err);
      return 0;
    }
  }

  getAgentUsage(agentId) {
    try {
      // Validate agent ID format
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return null;
      }
      
      // Check if agent exists
      const agent = this.getAgent(agentId);
      if (!agent) return null;
      
      // Get token counts
      const tokenQuery = this.db.prepare(
        `SELECT 
          COALESCE(SUM(tokensIn), 0) as totalTokensIn,
          COALESCE(SUM(tokensOut), 0) as totalTokensOut
        FROM messages 
        WHERE sessionId IN (SELECT id FROM sessions WHERE agentId = ?)`
      );
      
      const tokenResult = tokenQuery.get(agentId);
      
      // Get session count
      const sessionCount = this.db.prepare(
        "SELECT COUNT(*) as count FROM sessions WHERE agentId = ?"
      ).get(agentId).count;
      
      // Get total message count
      const messageCount = this.db.prepare(
        "SELECT COUNT(*) as count FROM messages WHERE sessionId IN (SELECT id FROM sessions WHERE agentId = ?)"
      ).get(agentId).count;
      
      return {
        agentId,
        totalTokensIn: tokenResult.totalTokensIn,
        totalTokensOut: tokenResult.totalTokensOut,
        sessions: sessionCount,
        totalMessages: messageCount
      };
    } catch (err) {
      console.error('Error getting agent usage:', err);
      return null;
    }
  }

  // Job management methods
  createJob(jobData) {
    try {
      const { name, type, data = {} } = jobData;
      
      if (!name || typeof name !== 'string') {
        throw new Error('Job name is required and must be a string');
      }
      
      if (!type || typeof type !== 'string') {
        throw new Error('Job type is required and must be a string');
      }
      
      const jobId = crypto.randomUUID();
      const now = new Date().toISOString();
      
      const job = {
        id: jobId,
        name: sanitizeContent(name, 'job name'),
        type: sanitizeContent(type, 'job type'),
        status: 'pending',
        progress: 0,
        data: data,
        createdAt: now,
        startedAt: null,
        completedAt: null,
        error: null
      };
      
      const insertStmt = this.db.prepare(
        `INSERT INTO jobs (
          id, name, type, status, progress, data, 
          createdAt, startedAt, completedAt, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      
      insertStmt.run(
        job.id,
        job.name,
        job.type,
        job.status,
        job.progress,
        JSON.stringify(job.data),
        job.createdAt,
        job.startedAt,
        job.completedAt,
        job.error
      );
      
      return job;
    } catch (err) {
      console.error('Error creating job:', err.message);
      throw err;
    }
  }
  
  getPendingJobs(limit = 10) {
    try {
      const safeLimit = Math.min(Math.max(Number(limit), 1), 100);
      
      const rows = this.db.prepare(
        `SELECT * FROM jobs 
        WHERE status = 'pending' 
        ORDER BY createdAt ASC 
        LIMIT ?`
      ).all(safeLimit);
      
      return rows.map(row => ({
        ...row,
        data: JSON.parse(row.data || '{}')
      }));
    } catch (err) {
      console.error('Error getting pending jobs:', err.message);
      return [];
    }
  }
  
  getJob(jobId) {
    try {
      if (!jobId || typeof jobId !== 'string') {
        return null;
      }
      
      const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
      
      if (!row) {
        return null;
      }
      
      return {
        ...row,
        data: JSON.parse(row.data || '{}')
      };
    } catch (err) {
      console.error('Error getting job:', err.message);
      return null;
    }
  }
  
  updateJob(jobId, updates) {
    try {
      if (!jobId || typeof jobId !== 'string') {
        throw new Error('Job ID is required');
      }
      
      // Get current job first
      const currentJob = this.getJob(jobId);
      if (!currentJob) {
        throw new Error(`Job with ID ${jobId} not found`);
      }
      
      // Prepare update fields
      const updateFields = [];
      const updateValues = [];
      
      if (updates.status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(sanitizeContent(updates.status, 'job status'));
      }
      
      if (updates.progress !== undefined) {
        updateFields.push('progress = ?');
        updateValues.push(Number(updates.progress));
      }
      
      if (updates.data !== undefined) {
        updateFields.push('data = ?');
        updateValues.push(JSON.stringify(updates.data));
      }
      
      if (updates.startedAt !== undefined) {
        updateFields.push('startedAt = ?');
        updateValues.push(updates.startedAt);
      }
      
      if (updates.completedAt !== undefined) {
        updateFields.push('completedAt = ?');
        updateValues.push(updates.completedAt);
      }
      
      if (updates.error !== undefined) {
        updateFields.push('error = ?');
        updateValues.push(sanitizeContent(updates.error, 'job error'));
      }
      
      if (updates.result !== undefined) {
        updateFields.push('result = ?');
        updateValues.push(JSON.stringify(updates.result));
      }
      
      if (updateFields.length === 0) {
        return currentJob; // No updates to apply
      }
      
      // Add job ID to the end for the WHERE clause
      updateValues.push(jobId);
      
      const updateStmt = this.db.prepare(
        `UPDATE jobs SET ${updateFields.join(', ')} WHERE id = ?`
      );
      
      updateStmt.run(...updateValues);
      
      // Return updated job
      return this.getJob(jobId);
    } catch (err) {
      console.error('Error updating job:', err.message);
      throw err;
    }
  }
  
  getJobs(filters = {}) {
    try {
      let query = "SELECT * FROM jobs";
      const whereConditions = [];
      const params = [];
      
      if (filters.status) {
        whereConditions.push("status = ?");
        params.push(filters.status);
      }
      
      if (filters.type) {
        whereConditions.push("type = ?");
        params.push(filters.type);
      }
      
      if (filters.limit) {
        const safeLimit = Math.min(Math.max(Number(filters.limit), 1), 1000);
        if (!whereConditions.length) {
          query += " ORDER BY createdAt DESC LIMIT ?";
        } else {
          query += " ORDER BY createdAt DESC LIMIT ?";
        }
        params.push(safeLimit);
      } else {
        query += " ORDER BY createdAt DESC";
      }
      
      if (whereConditions.length > 0) {
        query += " WHERE " + whereConditions.join(" AND ");
      }
      
      const rows = this.db.prepare(query).all(...params);
      
      return rows.map(row => ({
        ...row,
        data: JSON.parse(row.data || '{}'),
        result: row.result ? JSON.parse(row.result) : null
      }));
    } catch (err) {
      console.error('Error getting jobs:', err.message);
      return [];
    }
  }

  deleteJob(jobId) {
    try {
      if (!jobId || typeof jobId !== 'string') {
        throw new Error('Job ID is required and must be a string');
      }
      
      const deleteStmt = this.db.prepare('DELETE FROM jobs WHERE id = ?');
      const result = deleteStmt.run(jobId);
      
      return result.changes > 0;
    } catch (err) {
      console.error('Error deleting job:', err.message);
      return false;
    }
  }
}