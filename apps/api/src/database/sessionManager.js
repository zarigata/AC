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
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    title TEXT DEFAULT \"New Chat\",
    agent_id TEXT,
    status TEXT DEFAULT \"active\",
    metadata TEXT DEFAULT \"{}\"
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (\"user\", \"assistant\", \"system\")),
    content TEXT NOT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tokens_used INTEGER DEFAULT 0,
    response_time_ms INTEGER DEFAULT 0,
    metadata TEXT DEFAULT \"{}\",
    tokensIn INTEGER DEFAULT 0,
    tokensOut INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS session_stats (
    session_id TEXT PRIMARY KEY,
    total_messages INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NOT DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * Session Manager class
 */
export class SessionManager {
  constructor(registry) {
    this.db = null;
    this.initialized = false;
    this.registry = registry;
    this.tokenManager = new TokenManager(registry);
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    if (this.initialized) return;

    this.db = await open({
      filename: "./chat-sessions.db",
      driver: sqlite3.Database
    });

    // Enable foreign keys
    await this.db.exec("PRAGMA foreign_keys = ON");

    // Create schema if needed
    await this.db.exec(SCHEMA);

    this.initialized = true;
    console.log("SessionManager initialized with token tracking support");
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
      userId,
      title: options.title || "New Chat",
      agentId: options.agentId || null,
      status: options.status || "active",
      metadata: options.metadata || {},
      createdAt: now,
      updatedAt: now
    };

    await this.db.run(`
      INSERT INTO sessions (id, user_id, title, agent_id, status, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      sessionData.id,
      sessionData.userId,
      sessionData.title,
      sessionData.agentId,
      sessionData.status,
      JSON.stringify(sessionData.metadata),
      sessionData.createdAt,
      sessionData.updatedAt
    ]);

    // Create initial stats record
    await this.db.run(`
      INSERT INTO session_stats (session_id, total_messages, total_tokens, total_duration, created_at, updated_at)
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
      SELECT id, user_id, title, agent_id, status, metadata, created_at, updated_at
      FROM sessions 
      WHERE id = ?
    `, [sessionId]);

    if (!session) return null;

    return {
      id: session.id,
      userId: session.user_id,
      title: session.title,
      agentId: session.agent_id,
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

    // Process message through token manager
    const processedMessage = await this.tokenManager.processMessage({
      id: messageId,
      sessionId,
      role: message.role,
      content: message.content,
      model: options.metadata?.model || "default"
    }, options.metadata?.model);

    const messageData = {
      id: messageId,
      sessionId,
      role: message.role,
      content: message.content,
      timestamp: now,
      tokensUsed: processedMessage.tokensIn || 0,
      responseTimeMs: options.responseTimeMs || 0,
      metadata: options.metadata || {},
      tokensIn: processedMessage.tokensIn || 0,
      tokensOut: processedMessage.tokensOut || 0
    };

    await this.db.run(`
      INSERT INTO messages (id, session_id, role, content, timestamp, tokens_used, response_time_ms, metadata, tokensIn, tokensOut)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      messageData.id,
      messageData.SessionId,
      messageData.role,
      messageData.content,
      messageData.timestamp,
      messageData.tokensUsed,
      messageData.responseTimeMs,
      JSON.stringify(messageData.metadata),
      messageData.tokensIn,
      messageData.tokensOut
    ]);

    // Update session stats
    await this.db.run(`
      UPDATE session_stats 
      SET total_messages = total_messages + 1,
          total_tokens = total_tokens + ?,
          total_duration = total_duration + ?,
          updated_at = ?
      WHERE session_id = ?
    `, [
      messageData.tokensIn + messageData.tokensOut,
      messageData.responseTimeMs || 0,
      now,
      sessionId
    ]);

    // Update session updated_at
    await this.db.run("UPDATE sessions SET updated_at = ? WHERE id = ?", [now, sessionId]);

    return messageData;
  }

  /**
   * Get messages for a session with token tracking
   */
  async getMessages(sessionId) {
    if (!this.initialized) await this.initialize();

    const messages = await this.db.all(`
      SELECT id, session_id, role, content, timestamp, tokens_used, response_time_ms, metadata, tokensIn, tokensOut
      FROM messages 
      WHERE session_id = ? 
      ORDER BY timestamp ASC
    `, [sessionId]);

    return {
      sessionId,
      messages: messages.map(msg => ({
        id: msg.id,
        sessionId: msg.session_id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        tokensUsed: msg.tokens_used,
        tokensIn: msg.tokensIn || 0,
        tokensOut: msg.tokensOut || 0,
        responseTimeMs: msg.response_time_ms,
        metadata: JSON.parse(msg.metadata || "{}")
      }))
    };
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
