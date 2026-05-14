/**
 * Session Manager for Chat Persistence
 * Handles SQLite database operations for chat sessions
 */

import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";
import TokenManager from "../token/tokenManager.js";

/**
 * Chat session database schema
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    title TEXT DEFAULT \"New Chat\",
    agent_id TEXT,
    status TEXT DEFAULT \"active\",
    metadata TEXT DEFAULT \"{}\"
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (\"user\", \"assistant\", \"system\")),
    content TEXT NOT NULL,
    model TEXT DEFAULT \"default\",
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tokens_used INTEGER DEFAULT 0,
    response_time_ms INTEGER DEFAULT 0,
    metadata TEXT DEFAULT \"{}\",
    tokensIn INTEGER DEFAULT 0,
    tokensOut INTEGER DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_session_stats (
    session_id TEXT PRIMARY KEY,
    total_messages INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * Session Manager class
 */
export class SessionManager {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.tokenManager = null; // Will be initialized when registry is available
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    if (this.initialized) return;

    // Use the same database path as the main application
    const databasePath = process.env.ZSIISTANT_DB_PATH || new URL("../../data/zsiistant.sqlite", import.meta.url).pathname;
    
    this.db = await open({
      filename: databasePath,
      driver: sqlite3.Database
    });

    // Enable foreign keys
    await this.db.exec("PRAGMA foreign_keys = ON");

    // Create schema if needed
    await this.db.exec(SCHEMA);

    // Initialize TokenManager with registry reference when available
    if (global.registry) {
      this.tokenManager = new TokenManager(global.registry);
    } else {
      // Fallback for basic token counting without registry
      this.tokenManager = {
        countTokens: (text) => {
          if (!text || typeof text !== 'string') return 0;
          return Math.ceil(text.length / 4); // Simple approximation
        }
      };
    }

    this.initialized = true;
    console.log("SessionManager initialized with token tracking support");
  }

  /**
   * Set the registry reference for token management
   */
  setRegistry(registry) {
    if (registry && this.tokenManager === null) {
      this.tokenManager = new TokenManager(registry);
      console.log("TokenManager initialized with registry");
    }
  }

  /**
   * Create a new session
   */
  async createSession(userId, options = {}) {
    if (!this.initialized) await this.initialize();

    const sessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();

    const sessionData = {
      id: sessionId,
      userId: userId,
      agentId: options.agentId || null,
      title: options.title || "New Chat",
      status: options.status || "active",
      metadata: options.metadata ? JSON.stringify(options.metadata) : "{}",
      createdAt: now,
      updatedAt: now
    };

    await this.db.run(`
      INSERT INTO chat_sessions (id, user_id, agent_id, title, status, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      sessionData.id,
      sessionData.userId,
      sessionData.agentId,
      sessionData.title,
      sessionData.status,
      sessionData.metadata,
      sessionData.createdAt,
      sessionData.updatedAt
    ]);

    // Create initial stats record
    await this.db.run(`
      INSERT INTO chat_session_stats (session_id, total_messages, total_tokens, total_duration, created_at, updated_at)
      VALUES (?, 0, 0, 0, ?, ?)
    `, [sessionData.id, now, now]);

    return sessionData;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId) {
    if (!this.initialized) await this.initialize();

    const session = await this.db.get(`
      SELECT id, user_id, agent_id, title, status, metadata, created_at, updated_at
      FROM chat_sessions 
      WHERE id = ?
    `, [sessionId]);

    if (!session) return null;

    return {
      id: session.id,
      userId: session.user_id,
      agentId: session.agent_id,
      title: session.title,
      status: session.status,
      metadata: JSON.parse(session.metadata || "{}"),
      createdAt: session.created_at,
      updatedAt: session.updated_at
    };
  }

  /**
   * Save a message to session with enhanced token tracking
   */
  async saveMessage(sessionId, message, options = {}) {
    if (!this.initialized) await this.initialize();

    const messageId = "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();

    // Calculate tokens using TokenManager
    let tokensIn = 0;
    let tokensOut = 0;
    
    try {
      if (this.tokenManager && this.tokenManager.processMessage) {
        // Process the message to get token counts
        const processedMessage = await this.tokenManager.processMessage({
          id: messageId,
          sessionId,
          role: message.role,
          content: message.content,
          model: options.metadata?.model || "default"
        }, options.metadata?.model);
        
        tokensIn = processedMessage.tokensIn || 0;
        tokensOut = processedMessage.tokensOut || 0;
      } else {
        // Fallback to simple token counting
        tokensIn = this.tokenManager ? this.tokenManager.countTokens(message.content) : Math.ceil(message.content.length / 4);
        tokensOut = 0; // Will be calculated when we get the response
      }
      
      // Update the message with token info for return
      message.tokensIn = tokensIn;
      message.tokensOut = tokensOut;
      message.id = messageId;
      
    } catch (error) {
      console.error('Error calculating tokens for message:', error);
      // Fall back to simple token counting
      tokensIn = this.tokenManager ? this.tokenManager.countTokens(message.content) : Math.ceil(message.content.length / 4);
      tokensOut = 0;
    }

    await this.db.run(`
      INSERT INTO chat_messages (id, session_id, role, content, tokensIn, tokensOut, model, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      messageId,
      sessionId,
      message.role,
      message.content,
      tokensIn,
      tokensOut,
      options.metadata?.model || "default",
      now
    ]);

    // Update session stats
    await this.db.run(`
      UPDATE chat_session_stats 
      SET total_messages = total_messages + 1,
          total_tokens = total_tokens + ?,
          total_duration = total_duration + ?,
          updated_at = ?
      WHERE session_id = ?
    `, [
      tokensIn + tokensOut,
      message.responseTimeMs || 0,
      now,
      sessionId
    ]);

    // Update session updated_at
    await this.db.run("UPDATE chat_sessions SET updated_at = ? WHERE id = ?", [now, sessionId]);

    return {
      id: messageId,
      sessionId,
      role: message.role,
      content: message.content,
      tokensIn,
      tokensOut,
      model: options.metadata?.model || "default",
      timestamp: now
    };
  }

  /**
   * Get messages for a session with token tracking
   */
  async getMessages(sessionId) {
    if (!this.initialized) await this.initialize();

    const messages = await this.db.all(`
      SELECT id, session_id, role, content, tokensIn, tokensOut, model, createdAt
      FROM chat_messages 
      WHERE session_id = ? 
      ORDER BY createdAt ASC
    `, [sessionId]);

    return {
      sessionId,
      messages: messages.map(msg => ({
        id: msg.id,
        sessionId: msg.session_id,
        role: msg.role,
        content: msg.content,
        tokensIn: msg.tokensIn || 0,
        tokensOut: msg.tokensOut || 0,
        model: msg.model,
        timestamp: msg.createdAt
      }))
    };
  }

  /**
   * Get all sessions for a specific user
   */
  async getUserSessions(userId, limit = 50) {
    if (!this.initialized) await this.initialize();

    const sessions = await this.db.all(`
      SELECT id, user_id, agent_id, title, status, metadata, created_at, updated_at
      FROM chat_sessions 
      WHERE user_id = ? 
      ORDER BY updated_at DESC
      LIMIT ?
    `, [userId, limit]);

    return sessions.map(session => ({
      id: session.id,
      userId: session.user_id,
      agentId: session.agent_id,
      title: session.title,
      status: session.status,
      metadata: JSON.parse(session.metadata || "{}"),
      createdAt: session.created_at,
      updatedAt: session.updated_at
    }));
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId) {
    if (!this.initialized) await this.initialize();

    await this.db.run("DELETE FROM chat_messages WHERE session_id = ?", [sessionId]);
    await this.db.run("DELETE FROM chat_session_stats WHERE session_id = ?", [sessionId]);
    await this.db.run("DELETE FROM chat_sessions WHERE id = ?", [sessionId]);
  }

  /**
   * Update a session
   */
  async updateSession(sessionId, updates) {
    if (!this.initialized) await this.initialize();

    const fields = [];
    const values = [];
    
    if (updates.title) {
      fields.push("title = ?");
      values.push(updates.title);
    }
    
    if (updates.agentId !== undefined) {
      fields.push("agent_id = ?");
      values.push(updates.agentId);
    }
    
    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }
    
    if (fields.length > 0) {
      fields.push("updated_at = ?");
      values.push(new Date().toISOString());
      values.push(sessionId);
      
      await this.db.run(
        `UPDATE chat_sessions SET ${fields.join(", ")} WHERE id = ?`,
        values
      );
    }
    
    return this.getSession(sessionId);
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();

// Set global reference for registry access
if (global.registry) {
  sessionManager.setRegistry(global.registry);
}
