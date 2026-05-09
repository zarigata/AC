import crypto from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, extname, basename } from "node:path";
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
} from "../../../packages/shared/src/index.js";

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
            status TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            isolationMode TEXT NOT NULL,
            maxConcurrentTasks INTEGER NOT NULL,
            peerAccess INTEGER NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
          CREATE INDEX IF NOT EXISTS idx_agents_provider ON agents(provider);
          CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(createdAt);
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
          
          CREATE TABLE IF NOT EXISTS agent_files (
            id TEXT PRIMARY KEY,
            agentId TEXT NOT NULL,
            filename TEXT NOT NULL,
            originalName TEXT NOT NULL,
            fileSize INTEGER NOT NULL,
            fileType TEXT NOT NULL,
            fileHash TEXT NOT NULL,
            description TEXT,
            tags TEXT,
            uploadedAt TEXT NOT NULL,
            lastAccessed TEXT,
            accessCount INTEGER DEFAULT 0,
            FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_files_agent ON agent_files(agentId);
          CREATE INDEX IF NOT EXISTS idx_files_uploaded_at ON agent_files(uploadedAt);
          CREATE INDEX IF NOT EXISTS idx_files_filetype ON agent_files(fileType);
          CREATE INDEX IF NOT EXISTS idx_files_hash ON agent_files(fileHash);
        `);
        
        // Create file storage directory
        this.filesDir = join(dirname(options.databasePath), 'files');
        if (!existsSync(this.filesDir)) {
          mkdirSync(this.filesDir, { recursive: true, mode: 0o755 });
        }
        
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
        ...parsed
      };

      // Sanitize inputs
      agent.name = sanitizeContent(agent.name, 'agent name').trim();
      agent.purpose = sanitizeContent(agent.purpose, 'agent purpose').trim();
      
      // Begin transaction for data consistency with enhanced error handling
      this.db.exec('BEGIN TRANSACTION');
      try {
        const insertStmt = this.db.prepare(
          `
            INSERT INTO agents (
              id, name, purpose, status, provider, model, isolationMode,
              maxConcurrentTasks, peerAccess, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        );

        const result = insertStmt.run(
          agent.id,
          agent.name,
          agent.purpose,
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
        
        // Verify insertion was successful
        const verifyStmt = this.db.prepare('SELECT id FROM agents WHERE id = ?');
        const verification = verifyStmt.get(agent.id);
        if (!verification) {
          throw new Error('Agent creation verification failed');
        }
        
        this.db.exec('COMMIT');
        return agent;
      } catch (dbErr) {
        // Ensure transaction is rolled back even if commit fails
        try {
          this.db.exec('ROLLBACK');
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
        
        // Provide more detailed error information for debugging
        const errorMessage = dbErr.message.includes('UNIQUE constraint') 
          ? 'Agent ID already exists' 
          : 'Database operation failed';
        
        console.error('Database error creating agent:', dbErr);
        throw new Error(errorMessage);
      }
    } catch (err) {
      console.error('Error creating agent:', err);
      // Preserve specific error messages for important cases
      if (err.message.includes('100 registered agents')) {
        throw new Error('This machine already has 100 registered agents.');
      }
      // Sanitize error message for client
      // Preserve specific error messages for important security and validation cases
      const errorMessage = err.message.includes('100 registered agents') ? err.message :
                          err.message.includes('reserved name') ? err.message :
                          err.message.includes('invalid input') ? 'Invalid input data' :
                          'Failed to create agent';
      throw new Error(errorMessage);
    }
  }

  listAgents(limit = 100) {
    try {
      // Enforce reasonable limit with performance optimization
      const safeLimit = Math.min(Math.max(Number(limit), 1), 1000);
      
      // Optimize query by only selecting needed fields
      const rows = this.db
        .prepare("SELECT id, name, purpose, status, provider, model, isolationMode, maxConcurrentTasks, peerAccess, createdAt, updatedAt FROM agents ORDER BY createdAt DESC LIMIT ?")
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

      const allowed = ["name", "purpose", "status", "provider", "model", "isolationMode", "maxConcurrentTasks", "peerAccess"];
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
        this.db.prepare("DELETE FROM sessions WHERE agentId = ?").run(id);
        
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

      const insertStmt = this.db.prepare("INSERT INTO sessions (id, agentId, title, model, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)");
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
      const countResult = this.db.prepare("SELECT COUNT(*) as total FROM sessions WHERE agentId = ?").get(agentId);
      const total = countResult.total;
      
      // Get paginated results
      const sessions = this.db
        .prepare("SELECT * FROM sessions WHERE agentId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?")
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
      const session = this.db.prepare("SELECT * FROM sessions WHERE id = ? AND agentId = ?").get(sessionId, agentId);
      if (!session) {
        console.error('Session not found:', { agentId, sessionId });
        throw new Error('Session not found');
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
      const countResult = this.db.prepare("SELECT COUNT(*) as total FROM messages WHERE sessionId = ? AND sessionId IN (SELECT id FROM sessions WHERE agentId = ?)").get(sessionId, agentId);
      const total = countResult.total;
      
      // Get paginated results
      const messages = this.db
        .prepare("SELECT * FROM messages WHERE sessionId = ? AND sessionId IN (SELECT id FROM sessions WHERE agentId = ?) ORDER BY createdAt ASC LIMIT ? OFFSET ?")
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
        .prepare("SELECT id FROM sessions WHERE agentId = ? AND datetime(updatedAt) > datetime('now', '-5 minutes')")
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

  // File upload and management methods
  uploadFile(agentId, fileData, options = {}) {
    try {
      // Validate agent ID format
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        throw new Error('Invalid agent ID format');
      }
      
      // Check if agent exists
      const agent = this.getAgent(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }
      
      // Validate file data
      if (!fileData || typeof fileData !== 'object') {
        throw new Error('Invalid file data');
      }
      
      const { content, filename, originalName, description, tags = [] } = fileData;
      
      if (!content || typeof content !== 'string') {
        throw new Error('File content is required');
      }
      
      if (!filename || typeof filename !== 'string') {
        throw new Error('Filename is required');
      }
      
      if (!originalName || typeof originalName !== 'string') {
        throw new Error('Original filename is required');
      }
      
      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (content.length > maxSize) {
        throw new Error(`File size exceeds maximum limit of ${maxSize / 1024 / 1024}MB`);
      }
      
      // Generate file hash for deduplication
      const fileHash = createHash('sha256').update(content).digest('hex');
      
      // Check for duplicates
      const existingFile = this.db.prepare(
        "SELECT id FROM agent_files WHERE agentId = ? AND fileHash = ?"
      ).get(agentId, fileHash);
      
      if (existingFile) {
        return this.getFile(agentId, existingFile.id);
      }
      
      // Determine file type
      const fileExt = extname(filename).toLowerCase().substring(1);
      const fileType = fileExt || 'unknown';
      
      // Create file record
      const fileId = crypto.randomUUID();
      const timestamp = now();
      
      const insertStmt = this.db.prepare(
        `INSERT INTO agent_files (
          id, agentId, filename, originalName, fileSize, fileType, fileHash, 
          description, tags, uploadedAt, lastAccessed, accessCount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      
      const result = insertStmt.run(
        fileId, agentId, filename, originalName, content.length, fileType, 
        fileHash, description, JSON.stringify(tags), timestamp, timestamp, 0
      );
      
      if (result.changes === 0) {
        throw new Error('Failed to save file record');
      }
      
      // Save actual file to disk
      const filePath = join(this.filesDir, fileId);
      writeFileSync(filePath, content);
      
      return {
        id: fileId,
        agentId,
        filename,
        originalName,
        fileSize: content.length,
        fileType,
        fileHash,
        description,
        tags,
        uploadedAt: timestamp,
        lastAccessed: timestamp,
        accessCount: 0,
        url: `/api/agents/${agentId}/files/${fileId}`
      };
    } catch (err) {
      console.error('Error uploading file:', err);
      throw err;
    }
  }
  
  getAgentFiles(agentId, options = {}) {
    try {
      // Validate agent ID format
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return [];
      }
      
      // Check if agent exists
      const agent = this.getAgent(agentId);
      if (!agent) {
        return [];
      }
      
      // Apply pagination
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(Math.max(options.limit || 50, 1), 100);
      const offset = (page - 1) * limit;
      
      // Get total count
      const countResult = this.db.prepare(
        "SELECT COUNT(*) as total FROM agent_files WHERE agentId = ?"
      ).get(agentId);
      
      const total = countResult.total;
      
      // Get paginated files
      const filesQuery = this.db.prepare(
        "SELECT * FROM agent_files WHERE agentId = ? ORDER BY uploadedAt DESC LIMIT ? OFFSET ?"
      );
      
      const files = filesQuery.all(agentId, limit, offset);
      
      // Convert tags from JSON string to array
      const processedFiles = files.map(file => ({
        ...file,
        tags: JSON.parse(file.tags || '[]')
      }));
      
      return {
        files: processedFiles,
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
      console.error('Error getting agent files:', err);
      return { files: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };
    }
  }
  
  getFile(agentId, fileId) {
    try {
      // Validate IDs format
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return null;
      }
      
      if (!fileId || typeof fileId !== 'string' || fileId.length > 64) {
        return null;
      }
      
      const file = this.db.prepare(
        "SELECT * FROM agent_files WHERE agentId = ? AND id = ?"
      ).get(agentId, fileId);
      
      if (!file) {
        return null;
      }
      
      // Convert tags from JSON string to array
      const processedFile = {
        ...file,
        tags: JSON.parse(file.tags || '[]')
      };
      
      // Update last accessed time and increment access count
      const timestamp = now();
      this.db.prepare(
        "UPDATE agent_files SET lastAccessed = ?, accessCount = accessCount + 1 WHERE id = ?"
      ).run(timestamp, fileId);
      
      processedFile.lastAccessed = timestamp;
      processedFile.accessCount += 1;
      
      // Read file content
      const filePath = join(this.filesDir, fileId);
      if (existsSync(filePath)) {
        processedFile.content = readFileSync(filePath, 'utf8');
      } else {
        throw new Error('File content not found on disk');
      }
      
      return processedFile;
    } catch (err) {
      console.error('Error getting file:', err);
      return null;
    }
  }
  
  deleteFile(agentId, fileId) {
    try {
      // Validate IDs format
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return false;
      }
      
      if (!fileId || typeof fileId !== 'string' || fileId.length > 64) {
        return false;
      }
      
      // Check if file exists and belongs to agent
      const file = this.db.prepare(
        "SELECT id FROM agent_files WHERE agentId = ? AND id = ?"
      ).get(agentId, fileId);
      
      if (!file) {
        return false;
      }
      
      // Delete file from disk
      const filePath = join(this.filesDir, fileId);
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
      }
      
      // Delete file record from database
      const result = this.db.prepare(
        "DELETE FROM agent_files WHERE agentId = ? AND id = ?"
      ).run(agentId, fileId);
      
      return result.changes > 0;
    } catch (err) {
      console.error('Error deleting file:', err);
      return false;
    }
  }
  
  updateFile(agentId, fileId, updates) {
    try {
      // Validate IDs format
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64) {
        return null;
      }
      
      if (!fileId || typeof fileId !== 'string' || fileId.length > 64) {
        return null;
      }
      
      // Check if file exists and belongs to agent
      const existingFile = this.db.prepare(
        "SELECT * FROM agent_files WHERE agentId = ? AND id = ?"
      ).get(agentId, fileId);
      
      if (!existingFile) {
        return null;
      }
      
      const allowed = ['filename', 'description', 'tags'];
      const fields = [];
      const values = [];
      
      // Validate and sanitize updates
      for (const key of allowed) {
        if (key in updates) {
          let value = updates[key];
          
          if (key === 'filename' && (typeof value !== 'string' || value.length > 200)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === 'description' && typeof value !== 'string' && value !== null) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === 'tags' && (!Array.isArray(value) || value.length > 50)) {
            throw new Error(`Invalid ${key} value: must be an array with max 50 items`);
          }
          
          fields.push(`${key} = ?`);
          values.push(key === 'tags' ? JSON.stringify(value) : value);
        }
      }
      
      if (fields.length === 0) {
        return this.getFile(agentId, fileId);
      }
      
      // Update timestamp
      fields.push('lastAccessed = ?');
      values.push(now());
      values.push(agentId);
      values.push(fileId);
      
      const updateStmt = this.db.prepare(`UPDATE agent_files SET ${fields.join(', ')} WHERE agentId = ? AND id = ?`);
      const result = updateStmt.run(...values);
      
      if (result.changes === 0) {
        return null;
      }
      
      return this.getFile(agentId, fileId);
    } catch (err) {
      console.error('Error updating file:', err);
      throw err;
    }
  }
}