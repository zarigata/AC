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
  
  // Additional security: remove Unicode control characters and surrogate pairs
  sanitized = sanitized.replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
                      .replace(/\uD[89AB][\uDC00-\uDFFF]/g, '');
  
  return sanitized;
};

// Comprehensive input validation
const validateInput = (input, rules, fieldName) => {
  if (!input && input !== '' && input !== 0 && input !== false) {
    throw new Error(`${fieldName} is required`);
  }
  
  // Check for prototype pollution attempts
  if (input && typeof input === 'object') {
    // Check for prototype pollution attempts - only check own properties
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of dangerousKeys) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        throw new Error(`${fieldName} contains potentially dangerous property: ${key}`);
      }
    }
    
    // Check for circular references and deeply nested objects
    const maxDepth = 10;
    const checkDepth = (obj, depth = 0) => {
      if (depth > maxDepth) {
        throw new Error(`${fieldName} is too deeply nested`);
      }
      
      if (obj && typeof obj === 'object') {
        for (const value of Object.values(obj)) {
          if (typeof value === 'object' && value !== null) {
            checkDepth(value, depth + 1);
          }
        }
      }
    };
    checkDepth(input);
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
          
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            priority INTEGER NOT NULL DEFAULT 0,
            progress INTEGER NOT NULL DEFAULT 0,
            result TEXT,
            error TEXT,
            createdAt TEXT NOT NULL,
            startedAt TEXT,
            completedAt TEXT,
            updatedAt TEXT NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
          CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
          CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(createdAt);
          CREATE INDEX IF NOT EXISTS idx_jobs_started_at ON jobs(startedAt);
          CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updatedAt);
          
          CREATE TABLE IF NOT EXISTS presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            config TEXT NOT NULL,
            isBuiltIn INTEGER NOT NULL DEFAULT 0,
            isActive INTEGER NOT NULL DEFAULT 1,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            createdBy TEXT
          );
          
          CREATE INDEX IF NOT EXISTS idx_presets_name ON presets(name);
          CREATE INDEX IF NOT EXISTS idx_presets_created_at ON presets(createdAt);
          CREATE INDEX IF NOT EXISTS idx_presets_is_active ON presets(isActive);
          CREATE INDEX IF NOT EXISTS idx_presets_is_builtin ON presets(isBuiltIn);
          
          CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            version TEXT NOT NULL DEFAULT '1.0.0',
            author TEXT NOT NULL,
            category TEXT NOT NULL,
            tags TEXT,
            code TEXT NOT NULL,
            dependencies TEXT,
            configSchema TEXT,
            isBuiltIn INTEGER NOT NULL DEFAULT 0,
            isActive INTEGER NOT NULL DEFAULT 1,
            isPublic INTEGER NOT NULL DEFAULT 1,
            downloadCount INTEGER NOT NULL DEFAULT 0,
            rating REAL NOT NULL DEFAULT 0,
            reviewCount INTEGER NOT NULL DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            publishedAt TEXT
          );
          
          CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
          CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
          CREATE INDEX IF NOT EXISTS idx_skills_author ON skills(author);
          CREATE INDEX IF NOT EXISTS idx_skills_is_active ON skills(isActive);
          CREATE INDEX IF NOT EXISTS idx_skills_is_builtin ON skills(isBuiltIn);
          CREATE INDEX IF NOT EXISTS idx_skills_is_public ON skills(isPublic);
          CREATE INDEX IF NOT EXISTS idx_skills_created_at ON skills(createdAt);
          CREATE INDEX IF NOT EXISTS idx_skills_category_active ON skills(category, isActive);
          
          CREATE TABLE IF NOT EXISTS agent_memory (
            id TEXT PRIMARY KEY,
            agentId TEXT NOT NULL,
            type TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            metadata TEXT,
            expiresAt TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_id ON agent_memory(agentId);
          CREATE INDEX IF NOT EXISTS idx_agent_memory_type_key ON agent_memory(type, key);
          CREATE INDEX IF NOT EXISTS idx_agent_memory_expires_at ON agent_memory(expiresAt);
          CREATE INDEX IF NOT EXISTS idx_agent_memory_created_at ON agent_memory(createdAt);
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
      // Validate ID format with UUID check
      if (!id || typeof id !== 'string' || id.length > 64) {
        return null;
      }
      
      // Validate UUID format to prevent injection
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('Invalid agent ID format');
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

      // Use parameterized query to prevent SQL injection
      const updateSql = `UPDATE agents SET ${fields.join(', ')} WHERE id = ?`;
      const updateStmt = this.db.prepare(updateSql);
      const result = updateStmt.run(...values);
      
      if (result.changes === 0) {
        return null;
      }
      
      return this.getAgent(id);
    } catch (err) {
      console.error('Error updating agent:', err.message);
      throw new Error('Failed to update agent');
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
      
      // Enhanced file validation with security checks
      
      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (content.length > maxSize) {
        throw new Error(`File size exceeds maximum limit of ${maxSize / 1024 / 1024}MB`);
      }
      
      // Validate filename for security
      if (filename.length > 255) {
        throw new Error('Filename too long (max 255 characters)');
      }
      
      // Check for dangerous file extensions
      const dangerousExtensions = [
        'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'reg', 'wsf', 'js', 'vbs', 'ps1', 
        'sh', 'bash', 'zsh', 'fish', 'dll', 'so', 'dylib', 'jar', 'app', 'dmg',
        'deb', 'rpm', 'msi', 'iso', 'img', 'bin', 'torrent', 'apk', 'ipa'
      ];
      
      const fileExt = extname(filename).toLowerCase().substring(1);
      if (dangerousExtensions.includes(fileExt)) {
        throw new Error(`File type not allowed: .${fileExt}`);
      }
      
      // Check for path traversal attempts in filename
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Filename contains invalid characters');
      }
      
      // Sanitize description if provided
      if (description) {
        sanitizeContent(description, 'file description');
      }
      
      // Validate tags
      if (!Array.isArray(tags)) {
        throw new Error('Tags must be an array');
      }
      
      for (const tag of tags) {
        if (typeof tag !== 'string' || tag.length > 50) {
          throw new Error('Each tag must be a string with max 50 characters');
        }
        // Sanitize tags
        sanitizeContent(tag, 'tag');
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
      const fileExt2 = extname(filename).toLowerCase().substring(1);
      const fileType = fileExt2 || 'unknown';
      
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

  // Job Queue Methods
  
  createJob(input) {
    try {
      // Validate input
      validateInput(input, {
        name: { required: true, type: 'string', minLength: 2, maxLength: 100 },
        type: { required: true, type: 'string', minLength: 2, maxLength: 50 },
        payload: { required: true, type: 'object' },
        priority: { required: false, type: 'number', min: 0, max: 100, default: 0 }
      }, 'Job input');

      const id = crypto.randomUUID();
      const timestamp = now();
      
      const job = {
        id,
        name: sanitizeContent(input.name, 'job name').trim(),
        type: sanitizeContent(input.type, 'job type').trim(),
        payload: JSON.stringify(input.payload),
        status: 'pending',
        priority: input.priority || 0,
        progress: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      this.db.exec('BEGIN TRANSACTION');
      try {
        const insertStmt = this.db.prepare(
          `INSERT INTO jobs (id, name, type, payload, status, priority, progress, createdAt, updatedAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        const result = insertStmt.run(
          job.id,
          job.name,
          job.type,
          job.payload,
          job.status,
          job.priority,
          job.progress,
          job.createdAt,
          job.updatedAt
        );

        if (result.changes === 0) {
          throw new Error('Failed to create job');
        }

        this.db.exec('COMMIT');
        return job;
      } catch (dbErr) {
        try {
          this.db.exec('ROLLBACK');
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
        throw new Error(`Failed to create job: ${dbErr.message}`);
      }
    } catch (err) {
      console.error('Error creating job:', err);
      throw err;
    }
  }

  listJobs(status = null, limit = 50, offset = 0) {
    try {
      let query = 'SELECT * FROM jobs';
      const params = [];
      
      if (status) {
        query += ' WHERE status = ?';
        params.push(status);
      }
      
      query += ' ORDER BY priority DESC, createdAt DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const stmt = this.db.prepare(query);
      const jobs = stmt.all(...params);
      
      // Parse payload JSON
      return jobs.map(job => ({
        ...job,
        payload: JSON.parse(job.payload),
        ...(job.result ? { result: JSON.parse(job.result) } : {})
      }));
    } catch (err) {
      console.error('Error listing jobs:', err);
      throw err;
    }
  }

  getJob(jobId) {
    try {
      const stmt = this.db.prepare('SELECT * FROM jobs WHERE id = ?');
      const job = stmt.get(jobId);
      
      if (!job) {
        return null;
      }
      
      return {
        ...job,
        payload: JSON.parse(job.payload),
        ...(job.result ? { result: JSON.parse(job.result) } : {})
      };
    } catch (err) {
      console.error('Error getting job:', err);
      throw err;
    }
  }

  updateJob(jobId, updates) {
    try {
      // Validate job exists
      const existingJob = this.getJob(jobId);
      if (!existingJob) {
        throw new Error('Job not found');
      }

      validateInput(updates, {
        status: { required: false, type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
        progress: { required: false, type: 'number', min: 0, max: 100 },
        result: { required: false, type: 'object' },
        error: { required: false, type: 'string' },
        priority: { required: false, type: 'number', min: 0, max: 100 }
      }, 'Job updates');

      const fields = [];
      const values = [];
      const timestamp = now();

      // Handle special fields
      if (updates.status) {
        fields.push('status = ?');
        values.push(updates.status);
        
        // Set startedAt when job starts
        if (updates.status === 'running' && !existingJob.startedAt) {
          fields.push('startedAt = ?');
          values.push(timestamp);
        }
        
        // Set completedAt when job completes
        if (updates.status === 'completed' && !existingJob.completedAt) {
          fields.push('completedAt = ?');
          values.push(timestamp);
        }
      }

      if (updates.progress !== undefined) {
        fields.push('progress = ?');
        values.push(updates.progress);
      }

      if (updates.result !== undefined) {
        fields.push('result = ?');
        values.push(JSON.stringify(updates.result));
      }

      if (updates.error !== undefined) {
        fields.push('error = ?');
        values.push(updates.error);
      }

      if (updates.priority !== undefined) {
        fields.push('priority = ?');
        values.push(updates.priority);
      }

      // Always update updatedAt timestamp
      fields.push('updatedAt = ?');
      values.push(timestamp);
      values.push(jobId);

      if (fields.length === 0) {
        return existingJob;
      }

      const updateStmt = this.db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`);
      const result = updateStmt.run(...values);

      if (result.changes === 0) {
        throw new Error('Failed to update job');
      }

      return this.getJob(jobId);
    } catch (err) {
      console.error('Error updating job:', err);
      throw err;
    }
  }

  deleteJob(jobId) {
    try {
      // Validate job ID format
      if (!jobId || typeof jobId !== 'string' || jobId.length !== 36) {
        throw new Error('Invalid job ID format');
      }

      const deleteStmt = this.db.prepare('DELETE FROM jobs WHERE id = ?');
      const result = deleteStmt.run(jobId);

      return result.changes > 0;
    } catch (err) {
      console.error('Error deleting job:', err);
      throw err;
    }
  }

  getPendingJobs(limit = 10) {
    try {
      const stmt = this.db.prepare(
        'SELECT * FROM jobs WHERE status = ? ORDER BY priority DESC, createdAt DESC LIMIT ?'
      );
      const jobs = stmt.all('pending', limit);
      
      return jobs.map(job => ({
        ...job,
        payload: JSON.parse(job.payload),
        ...(job.result ? { result: JSON.parse(job.result) } : {})
      }));
    } catch (err) {
      console.error('Error getting pending jobs:', err);
      throw err;
    }
  }

  // Preset Management Methods
  
  createPreset(input) {
    try {
      // Validate input
      validateInput(input, {
        name: { required: true, type: 'string', minLength: 2, maxLength: 100 },
        description: { required: true, type: 'string', minLength: 10, maxLength: 500 },
        config: { required: true, type: 'object' },
        isBuiltIn: { required: false, type: 'boolean', default: false },
        createdBy: { required: false, type: 'string', maxLength: 100 }
      }, 'Preset input');

      // Check if preset with same name already exists
      const existingPreset = this.db.prepare('SELECT id FROM presets WHERE name = ?').get(input.name);
      if (existingPreset) {
        throw new Error(`Preset with name '${input.name}' already exists`);
      }

      const id = crypto.randomUUID();
      const timestamp = now();
      
      const preset = {
        id,
        name: sanitizeContent(input.name, 'preset name').trim(),
        description: sanitizeContent(input.description, 'preset description').trim(),
        config: JSON.stringify(input.config),
        isBuiltIn: Number(input.isBuiltIn || false),
        isActive: input.isActive !== undefined ? Number(input.isActive) : 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: input.createdBy ? sanitizeContent(input.createdBy, 'created by').trim() : null
      };

      this.db.exec('BEGIN TRANSACTION');
      try {
        const insertStmt = this.db.prepare(
          `INSERT INTO presets (id, name, description, config, isBuiltIn, isActive, createdAt, updatedAt, createdBy)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        const result = insertStmt.run(
          preset.id,
          preset.name,
          preset.description,
          preset.config,
          preset.isBuiltIn,
          preset.isActive,
          preset.createdAt,
          preset.updatedAt,
          preset.createdBy
        );

        if (result.changes === 0) {
          throw new Error('Failed to create preset');
        }

        this.db.exec('COMMIT');
        return preset;
      } catch (dbErr) {
        try {
          this.db.exec('ROLLBACK');
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
        throw new Error(`Failed to create preset: ${dbErr.message}`);
      }
    } catch (err) {
      console.error('Error creating preset:', err);
      throw err;
    }
  }

  listPresets(limit = 100, options = {}) {
    try {
      const safeLimit = Math.min(Math.max(Number(limit), 1), 1000);
      const offset = (options.page || 1 - 1) * safeLimit;
      
      let query = 'SELECT * FROM presets';
      const params = [];
      
      // Filter by active status if specified
      if (options.active !== undefined) {
        query += ' WHERE isActive = ?';
        params.push(Number(options.active));
      }
      
      // Filter by built-in status if specified
      if (options.builtIn !== undefined) {
        query += options.active ? ' AND isBuiltIn = ?' : ' WHERE isBuiltIn = ?';
        params.push(Number(options.builtIn));
      }
      
      query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
      params.push(safeLimit, offset);
      
      const rows = this.db.prepare(query).all(...params);
      
      return rows.map(row => ({
        ...row,
        config: JSON.parse(row.config),
        isBuiltIn: Boolean(row.isBuiltIn),
        isActive: Boolean(row.isActive)
      }));
    } catch (err) {
      console.error('Error listing presets:', err);
      return [];
    }
  }

  getPreset(id) {
    try {
      const row = this.db.prepare('SELECT * FROM presets WHERE id = ?').get(id);
      if (!row) return null;
      
      return {
        ...row,
        config: JSON.parse(row.config),
        isBuiltIn: Boolean(row.isBuiltIn),
        isActive: Boolean(row.isActive)
      };
    } catch (err) {
      console.error('Error getting preset:', err);
      return null;
    }
  }

  updatePreset(id, updates) {
    try {
      const existing = this.getPreset(id);
      if (!existing) throw new Error('Preset not found');
      
      const allowed = ['name', 'description', 'config', 'isActive', 'isBuiltIn'];
      const fields = [];
      const values = [];
      const timestamp = now();

      for (const key of allowed) {
        if (key in updates) {
          let value = updates[key];
          
          // Validate specific fields
          if (key === 'name' && (typeof value !== 'string' || value.length > 100)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === 'description' && (typeof value !== 'string' || value.length > 500)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === 'config' && (typeof value !== 'object')) {
            throw new Error(`Invalid ${key} value: must be an object`);
          }
          
          if (key === 'isBuiltIn' && typeof value !== 'boolean') {
            throw new Error(`Invalid ${key} value: must be boolean`);
          }
          
          if (key === 'isActive' && typeof value !== 'boolean') {
            throw new Error(`Invalid ${key} value: must be boolean`);
          }
          
          fields.push(`${key} = ?`);
          values.push(key === 'config' ? JSON.stringify(value) : 
                     key === 'isBuiltIn' || key === 'isActive' ? Number(value) : value);
        }
      }

      if (fields.length === 0) return existing;

      fields.push('updatedAt = ?');
      values.push(timestamp);
      values.push(id);

      const updateStmt = this.db.prepare(`UPDATE presets SET ${fields.join(', ')} WHERE id = ?`);
      const result = updateStmt.run(...values);

      if (result.changes === 0) {
        throw new Error('Failed to update preset');
      }

      return this.getPreset(id);
    } catch (err) {
      console.error('Error updating preset:', err);
      throw err;
    }
  }

  deletePreset(id) {
    try {
      // Check if preset exists and is built-in
      const existing = this.getPreset(id);
      if (!existing) return false;
      
      if (existing.isBuiltIn) {
        throw new Error('Cannot delete built-in presets');
      }

      const result = this.db.prepare('DELETE FROM presets WHERE id = ?').run(id);
      return result.changes > 0;
    } catch (err) {
      console.error('Error deleting preset:', err);
      return false;
    }
  }

  getActivePresets() {
    try {
      const rows = this.db.prepare('SELECT * FROM presets WHERE isActive = 1 ORDER BY createdAt DESC').all();
      
      return rows.map(row => ({
        ...row,
        config: JSON.parse(row.config),
        isBuiltIn: Boolean(row.isBuiltIn),
        isActive: Boolean(row.isActive)
      }));
    } catch (err) {
      console.error('Error getting active presets:', err);
      return [];
    }
  }

  seedBuiltInPresets() {
    if (this.listPresets().length > 0) {
      return;
    }

    const presets = [
      {
        name: "Home Assistant",
        description: "Calendar, reminders, household management, morning briefs - perfect for home automation",
        config: {
          defaultModel: "gpt-4o",
          safetyLevel: "moderate",
          tools: ["calendar", "reminders", "home_automation", "weather", "news"],
          personality: "helpful_household",
          channels: ["telegram"],
          maxTokens: 4000,
          temperature: 0.7
        },
        isBuiltIn: true,
        createdBy: "system"
      },
      {
        name: "Productivity Pro",
        description: "Task management, email triage, meeting notes, CRM - designed for productivity",
        config: {
          defaultModel: "claude-3.5-sonnet",
          safetyLevel: "high",
          tools: ["task_manager", "email", "calendar", "notes", "crm"],
          personality: "professional_assistant",
          channels: ["email", "slack"],
          maxTokens: 6000,
          temperature: 0.5
        },
        isBuiltIn: true,
        createdBy: "system"
      },
      {
        name: "Unfiltered",
        description: "Full access, no presets, configure everything - maximum control for power users",
        config: {
          defaultModel: "gpt-5.4",
          safetyLevel: "none",
          tools: ["all"],
          personality: "unfiltered_assistant",
          channels: ["all"],
          maxTokens: 32000,
          temperature: 0.8
        },
        isBuiltIn: true,
        createdBy: "system"
      }
    ];

    for (const preset of presets) {
      this.createPreset(preset);
    }
  }

  // Skill Management Methods
  
  createSkill(input) {
    try {
      // Validate input
      if (!input || typeof input !== 'object') {
        throw new Error('Skill input must be an object');
      }
      
      const tags = Array.isArray(input.tags) ? input.tags : [];
      const dependencies = Array.isArray(input.dependencies) ? input.dependencies : [];
      
      validateInput(input, {
        name: { required: true, type: 'string', minLength: 2, maxLength: 100 },
        description: { required: true, type: 'string', minLength: 10, maxLength: 1000 },
        version: { required: false, type: 'string', minLength: 2, maxLength: 20, default: '1.0.0' },
        author: { required: true, type: 'string', minLength: 2, maxLength: 100 },
        category: { required: true, type: 'string', minLength: 2, maxLength: 50 },
        code: { required: true, type: 'string' },
        isBuiltIn: { required: false, type: 'boolean', default: false },
        isActive: { required: false, type: 'boolean', default: true },
        isPublic: { required: false, type: 'boolean', default: true }
      }, 'Skill input');

      // Check if skill with same name and version already exists
      const existingSkill = this.db.prepare('SELECT id FROM skills WHERE name = ? AND version = ?').get(input.name, input.version || '1.0.0');
      if (existingSkill) {
        throw new Error(`Skill '${input.name}' version '${input.version}' already exists`);
      }

      const id = crypto.randomUUID();
      const timestamp = now();
      const publishedAt = input.isPublic ? timestamp : null;
      
      const skill = {
        id,
        name: sanitizeContent(input.name, 'skill name').trim(),
        description: sanitizeContent(input.description, 'skill description').trim(),
        version: input.version || '1.0.0',
        author: sanitizeContent(input.author, 'skill author').trim(),
        category: sanitizeContent(input.category, 'skill category').trim(),
        tags: JSON.stringify(input.tags || []),
        code: input.code,
        dependencies: JSON.stringify(input.dependencies || []),
        configSchema: input.configSchema ? JSON.stringify(input.configSchema) : null,
        isBuiltIn: Number(input.isBuiltIn || false),
        isActive: Number(input.isActive !== false),
        isPublic: Number(input.isPublic !== false),
        downloadCount: 0,
        rating: 0,
        reviewCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        publishedAt
      };

      this.db.exec('BEGIN TRANSACTION');
      try {
        const insertStmt = this.db.prepare(
          `INSERT INTO skills (
            id, name, description, version, author, category, tags, code,
            dependencies, configSchema, isBuiltIn, isActive, isPublic,
            downloadCount, rating, reviewCount, createdAt, updatedAt, publishedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        const result = insertStmt.run(
          skill.id,
          skill.name,
          skill.description,
          skill.version,
          skill.author,
          skill.category,
          skill.tags,
          skill.code,
          skill.dependencies,
          skill.configSchema,
          skill.isBuiltIn,
          skill.isActive,
          skill.isPublic,
          skill.downloadCount,
          skill.rating,
          skill.reviewCount,
          skill.createdAt,
          skill.updatedAt,
          skill.publishedAt
        );

        if (result.changes === 0) {
          throw new Error('Failed to create skill');
        }

        this.db.exec('COMMIT');
        return skill;
      } catch (dbErr) {
        try {
          this.db.exec('ROLLBACK');
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
        throw new Error(`Failed to create skill: ${dbErr.message}`);
      }
    } catch (err) {
      console.error('Error creating skill:', err);
      throw err;
    }
  }

  listSkills(limit = 100, options = {}) {
    try {
      const safeLimit = Math.min(Math.max(Number(limit), 1), 1000);
      const offset = (options.page || 1 - 1) * safeLimit;
      
      let query = 'SELECT * FROM skills';
      const params = [];
      
      // Apply filters
      const filters = [];
      
      if (options.category) {
        filters.push('category = ?');
        params.push(options.category);
      }
      
      if (options.author) {
        filters.push('author = ?');
        params.push(options.author);
      }
      
      if (options.isPublic !== undefined) {
        filters.push('isPublic = ?');
        params.push(Number(options.isPublic));
      }
      
      if (options.isActive !== undefined) {
        filters.push('isActive = ?');
        params.push(Number(options.isActive));
      }
      
      if (options.isBuiltIn !== undefined) {
        filters.push('isBuiltIn = ?');
        params.push(Number(options.isBuiltIn));
      }
      
      if (options.search) {
        filters.push('(name LIKE ? OR description LIKE ? OR tags LIKE ?)');
        const searchPattern = `%${options.search}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }
      
      if (filters.length > 0) {
        query += ' WHERE ' + filters.join(' AND ');
      }
      
      query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
      params.push(safeLimit, offset);
      
      const rows = this.db.prepare(query).all(...params);
      
      return rows.map(row => ({
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        dependencies: JSON.parse(row.dependencies || '[]'),
        configSchema: row.configSchema ? JSON.parse(row.configSchema) : null,
        isBuiltIn: Boolean(row.isBuiltIn),
        isActive: Boolean(row.isActive),
        isPublic: Boolean(row.isPublic),
        publishedAt: row.publishedAt
      }));
    } catch (err) {
      console.error('Error listing skills:', err);
      return [];
    }
  }

  getSkill(id) {
    try {
      const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
      if (!row) return null;
      
      return {
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        dependencies: JSON.parse(row.dependencies || '[]'),
        configSchema: row.configSchema ? JSON.parse(row.configSchema) : null,
        isBuiltIn: Boolean(row.isBuiltIn),
        isActive: Boolean(row.isActive),
        isPublic: Boolean(row.isPublic),
        publishedAt: row.publishedAt
      };
    } catch (err) {
      console.error('Error getting skill:', err);
      return null;
    }
  }

  updateSkill(id, updates) {
    try {
      const existing = this.getSkill(id);
      if (!existing) throw new Error('Skill not found');

      const allowed = ['name', 'description', 'version', 'author', 'category', 'tags', 'code', 'dependencies', 'configSchema', 'isActive', 'isPublic'];
      const fields = [];
      const values = [];
      const timestamp = now();

      for (const key of allowed) {
        if (key in updates) {
          let value = updates[key];
          
          // Validate specific fields
          if (key === 'name' && (typeof value !== 'string' || value.length > 100)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === 'description' && (typeof value !== 'string' || value.length > 1000)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === 'version' && (typeof value !== 'string' || value.length > 20)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === 'author' && (typeof value !== 'string' || value.length > 100)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === 'category' && (typeof value !== 'string' || value.length > 50)) {
            throw new Error(`Invalid ${key} value`);
          }
          
          if (key === 'tags' && (!Array.isArray(value))) {
            throw new Error(`Invalid ${key} value: must be an array`);
          }
          
          if (key === 'dependencies' && (!Array.isArray(value))) {
            throw new Error(`Invalid ${key} value: must be an array`);
          }
          
          if (key === 'code' && (typeof value !== 'string')) {
            throw new Error(`Invalid ${key} value: must be a string`);
          }
          
          if (key === 'configSchema' && (value !== null && typeof value !== 'object')) {
            throw new Error(`Invalid ${key} value: must be an object or null`);
          }
          
          if ((key === 'isActive' || key === 'isPublic') && typeof value !== 'boolean') {
            throw new Error(`Invalid ${key} value: must be boolean`);
          }
          
          fields.push(`${key} = ?`);
          values.push(key === 'tags' || key === 'dependencies' ? JSON.stringify(value) :
                     key === 'configSchema' ? (value ? JSON.stringify(value) : null) :
                     value);
        }
      }

      if (fields.length === 0) return existing;

      fields.push('updatedAt = ?');
      values.push(timestamp);
      values.push(id);

      const updateStmt = this.db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ?`);
      const result = updateStmt.run(...values);

      if (result.changes === 0) {
        throw new Error('Failed to update skill');
      }

      return this.getSkill(id);
    } catch (err) {
      console.error('Error updating skill:', err);
      throw err;
    }
  }

  deleteSkill(id) {
    try {
      // Check if skill exists and is built-in
      const existing = this.getSkill(id);
      if (!existing) return false;
      
      if (existing.isBuiltIn) {
        throw new Error('Cannot delete built-in skills');
      }

      const result = this.db.prepare('DELETE FROM skills WHERE id = ?').run(id);
      return result.changes > 0;
    } catch (err) {
      console.error('Error deleting skill:', err);
      return false;
    }
  }

  getSkillCategories() {
    try {
      const rows = this.db.prepare('SELECT DISTINCT category FROM skills WHERE isActive = 1 ORDER BY category').all();
      return rows.map(row => row.category);
    } catch (err) {
      console.error('Error getting skill categories:', err);
      return [];
    }
  }

  getPopularSkills(limit = 10) {
    try {
      const rows = this.db.prepare(
        'SELECT * FROM skills WHERE isActive = 1 AND isPublic = 1 ORDER BY downloadCount DESC, rating DESC, reviewCount DESC LIMIT ?'
      ).all(limit);
      
      return rows.map(row => ({
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        dependencies: JSON.parse(row.dependencies || '[]'),
        configSchema: row.configSchema ? JSON.parse(row.configSchema) : null,
        isBuiltIn: Boolean(row.isBuiltIn),
        isActive: Boolean(row.isActive),
        isPublic: Boolean(row.isPublic),
        publishedAt: row.publishedAt
      }));
    } catch (err) {
      console.error('Error getting popular skills:', err);
      return [];
    }
  }

  incrementSkillDownloads(skillId) {
    try {
      const result = this.db.prepare('UPDATE skills SET downloadCount = downloadCount + 1, updatedAt = ? WHERE id = ?').run(now(), skillId);
      return result.changes > 0;
    } catch (err) {
      console.error('Error incrementing skill downloads:', err);
      return false;
    }
  }

  rateSkill(skillId, rating) {
    try {
      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }
      
      const skill = this.getSkill(skillId);
      if (!skill) {
        throw new Error('Skill not found');
      }
      
      // Calculate new average rating
      const currentRating = skill.rating;
      const currentReviewCount = skill.reviewCount;
      const newTotalRating = (currentRating * currentReviewCount) + rating;
      const newReviewCount = currentReviewCount + 1;
      const newAverageRating = newTotalRating / newReviewCount;
      
      const result = this.db.prepare(
        'UPDATE skills SET rating = ?, reviewCount = ?, updatedAt = ? WHERE id = ?'
      ).run(newAverageRating, newReviewCount, now(), skillId);
      
      return result.changes > 0;
    } catch (err) {
      console.error('Error rating skill:', err);
      throw err;
    }
  }

  seedBuiltInSkills() {
    if (this.listSkills({ isBuiltIn: true }).length > 0) {
      return;
    }

    const skills = [
      {
        name: "Web Scraper",
        description: "Scrape content from websites with configurable selectors and output formatting",
        version: "1.0.0",
        author: "system",
        category: "data",
        tags: ["web", "scraping", "extraction"],
        code: `// Web Scraper Skill\nconst scrapeWeb = async (url, options = {}) => {\n  const { selectors = [], outputFormat = 'json' } = options;\n  // Implementation here\n  return { success: true, data: [] };\n};\n\nmodule.exports = { scrapeWeb };`,
        dependencies: [],
        isBuiltIn: true,
        isActive: true,
        isPublic: true
      },
      {
        name: "File Processor",
        description: "Process and analyze various file types with format detection and content extraction",
        version: "1.0.0",
        author: "system",
        category: "files",
        tags: ["files", "processing", "analysis"],
        code: `// File Processor Skill\nconst processFile = async (file, options = {}) => {\n  const { analyzeContent = true, extractMetadata = true } = options;\n  // Implementation here\n  return { success: true, processed: true };\n};\n\nmodule.exports = { processFile };`,
        dependencies: [],
        isBuiltIn: true,
        isActive: true,
        isPublic: true
      },
      {
        name: "Data Analyzer",
        description: "Analyze datasets with statistical analysis and visualization capabilities",
        version: "1.0.0",
        author: "system",
        category: "analysis",
        tags: ["data", "analysis", "statistics", "visualization"],
        code: `// Data Analyzer Skill\nconst analyzeData = async (data, options = {}) => {\n  const { type = 'descriptive', visualize = false } = options;\n  // Implementation here\n  return { success: true, analysis: {} };\n};\n\nmodule.exports = { analyzeData };`,
        dependencies: [],
        isBuiltIn: true,
        isActive: true,
        isPublic: true
      }
    ];

    for (const skill of skills) {
      this.createSkill(skill);
    }
  }

  // Agent Memory Methods
  
  setMemory(agentId, type, key, value, options = {}) {
    try {
      // Validate input
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('Invalid agent ID');
      }
      
      if (!type || typeof type !== 'string' || type.length > 50) {
        throw new Error('Invalid memory type');
      }
      
      if (!key || typeof key !== 'string' || key.length > 200) {
        throw new Error('Invalid memory key');
      }
      
      if (value === undefined || value === null) {
        throw new Error('Memory value cannot be null or undefined');
      }
      
      const id = crypto.randomUUID();
      const timestamp = now();
      const expiresAt = options.expiresAt ? new Date(options.expiresAt).toISOString() : null;
      const metadata = options.metadata ? JSON.stringify(options.metadata) : null;
      
      // Check if memory entry already exists and update it
      const existing = this.db.prepare('SELECT id FROM agent_memory WHERE agentId = ? AND type = ? AND key = ?').get(agentId, type, key);
      
      if (existing) {
        const updateStmt = this.db.prepare(
          `UPDATE agent_memory 
          SET value = ?, metadata = ?, expiresAt = ?, updatedAt = ? 
          WHERE id = ?`
        );
        
        updateStmt.run(
          typeof value === 'string' ? value : JSON.stringify(value),
          metadata,
          expiresAt,
          timestamp,
          existing.id
        );
        
        return { id: existing.id, agentId, type, key, value, metadata, expiresAt, updatedAt: timestamp };
      } else {
        const insertStmt = this.db.prepare(
          `INSERT INTO agent_memory 
          (id, agentId, type, key, value, metadata, expiresAt, createdAt, updatedAt) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        
        insertStmt.run(
          id,
          agentId,
          type,
          key,
          typeof value === 'string' ? value : JSON.stringify(value),
          metadata,
          expiresAt,
          timestamp,
          timestamp
        );
        
        return { id, agentId, type, key, value, metadata, expiresAt, createdAt: timestamp, updatedAt: timestamp };
      }
    } catch (err) {
      console.error('Error setting memory:', err);
      throw err;
    }
  }

  getMemory(agentId, type, key) {
    try {
      if (!agentId || !type || !key) {
        return null;
      }
      
      const row = this.db.prepare(
        `SELECT * FROM agent_memory 
        WHERE agentId = ? AND type = ? AND key = ?`
      ).get(agentId, type, key);
      
      if (!row) return null;
      
      // Check if memory has expired
      if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
        this.deleteMemory(agentId, type, key);
        return null;
      }
      
      return {
        id: row.id,
        agentId: row.agentId,
        type: row.type,
        key: row.key,
        value: row.value,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      };
    } catch (err) {
      console.error('Error getting memory:', err);
      return null;
    }
  }

  getMemories(agentId, type, limit = 100, options = {}) {
    try {
      if (!agentId) {
        return [];
      }
      
      const safeLimit = Math.min(Math.max(Number(limit), 1), 1000);
      
      let query = 'SELECT * FROM agent_memory WHERE agentId = ?';
      const params = [agentId];
      
      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }
      
      if (options.onlyActive !== undefined) {
        query += options.onlyActive ? ' AND (expiresAt IS NULL OR expiresAt > datetime("now"))' : '';
      }
      
      if (options.search) {
        query += ' AND (key LIKE ? OR value LIKE ?)';
        params.push(`%${options.search}%`, `%${options.search}%`);
      }
      
      query += ' ORDER BY createdAt DESC LIMIT ?';
      params.push(safeLimit);
      
      const rows = this.db.prepare(query).all(...params);
      
      return rows.map(row => ({
        id: row.id,
        agentId: row.agentId,
        type: row.type,
        key: row.key,
        value: row.value,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      })).filter(memory => {
        // Filter out expired memories
        if (memory.expiresAt && new Date(memory.expiresAt) < new Date()) {
          this.deleteMemory(memory.agentId, memory.type, memory.key);
          return false;
        }
        return true;
      });
    } catch (err) {
      console.error('Error getting memories:', err);
      return [];
    }
  }

  deleteMemory(agentId, type, key) {
    try {
      if (!agentId || !type || !key) {
        return false;
      }
      
      const result = this.db.prepare(
        'DELETE FROM agent_memory WHERE agentId = ? AND type = ? AND key = ?'
      ).run(agentId, type, key);
      
      return result.changes > 0;
    } catch (err) {
      console.error('Error deleting memory:', err);
      return false;
    }
  }

  clearMemories(agentId, type) {
    try {
      if (!agentId) {
        return false;
      }
      
      let query = 'DELETE FROM agent_memory WHERE agentId = ?';
      const params = [agentId];
      
      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }
      
      const result = this.db.prepare(query).run(...params);
      
      return result.changes > 0;
    } catch (err) {
      console.error('Error clearing memories:', err);
      return false;
    }
  }

  cleanupExpiredMemories() {
    try {
      const now = now();
      const result = this.db.prepare(
        'DELETE FROM agent_memory WHERE expiresAt IS NOT NULL AND expiresAt < ?'
      ).run(now);
      
      return result.changes;
    } catch (err) {
      console.error('Error cleaning up expired memories:', err);
      return 0;
    }
  }

  getMemoryStats(agentId) {
    try {
      if (!agentId) {
        return null;
      }
      
      // Get total memories
      const totalMemories = this.db.prepare(
        'SELECT COUNT(*) as count FROM agent_memory WHERE agentId = ?'
      ).get(agentId);
      
      // Get active memories (not expired)
      const activeMemories = this.db.prepare(
        'SELECT COUNT(*) as count FROM agent_memory WHERE agentId = ? AND (expiresAt IS NULL OR expiresAt > datetime("now"))'
      ).get(agentId);
      
      // Get memories by type
      const byType = this.db.prepare(
        'SELECT type, COUNT(*) as count FROM agent_memory WHERE agentId = ? GROUP BY type ORDER BY count DESC'
      ).all(agentId);
      
      return {
        agentId,
        total: totalMemories.count,
        active: activeMemories.count,
        expired: totalMemories.count - activeMemories.count,
        byType: byType.map(row => ({ type: row.type, count: row.count }))
      };
    } catch (err) {
      console.error('Error getting memory stats:', err);
      return null;
    }
  }
}