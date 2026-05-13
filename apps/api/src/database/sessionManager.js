/**
 * Session Manager for Chat Persistence
 * Handles SQLite database operations for chat sessions
 */

import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';

/**
 * Chat session database schema
 */
const SCHEMA = `
-- Sessions table - stores chat session metadata
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    title TEXT DEFAULT 'New Chat',
    agent_id TEXT,
    status TEXT DEFAULT 'active',
    metadata TEXT DEFAULT '{}'
);

-- Messages table - stores individual chat messages
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tokens_used INTEGER DEFAULT 0,
    response_time_ms INTEGER DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

-- Stats table for tracking usage
CREATE TABLE IF NOT EXISTS session_stats (
    session_id TEXT PRIMARY KEY,
    total_messages INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
`;

/**
 * Session Manager class
 */
class SessionManager {
  constructor(dbPath = './chat-sessions.db') {
    this.dbPath = dbPath;
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      // Enable foreign keys
      await this.db.exec('PRAGMA foreign_keys = ON;');
      
      // Enable WAL mode for better performance
      await this.db.exec('PRAGMA journal_mode = WAL;');
      
      // Create tables
      await this.db.exec(SCHEMA);
      
      this.initialized = true;
      console.log('Session manager initialized with database:', this.dbPath);
    } catch (error) {
      console.error('Failed to initialize session manager:', error);
      throw error;
    }
  }

  /**
   * Create a new chat session
   */
  async createSession(userId, options = {}) {
    if (!this.initialized) await this.initialize();

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const session = {
      id: sessionId,
      userId,
      title: options.title || 'New Chat',
      agentId: options.agentId || null,
      metadata: options.metadata || {},
      createdAt: now,
      updatedAt: now
    };

    await this.db.run(`
      INSERT INTO sessions (id, user_id, title, agent_id, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      session.id,
      session.userId,
      session.title,
      session.agentId,
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session.metadata)
    ]);

    // Initialize stats
    await this.db.run(`
      INSERT INTO session_stats (session_id, total_messages, total_tokens, total_duration, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      session.id,
      0, 0, 0, session.createdAt, session.updatedAt
    ]);

    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    if (!this.initialized) await this.initialize();

    const row = await this.db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      agentId: row.agent_id,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status
    };
  }

  /**
   * Update session metadata
   */
  async updateSession(sessionId, updates) {
    if (!this.initialized) await this.initialize();

    const setParts = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'metadata') {
        setParts.push('metadata = ?');
        values.push(JSON.stringify(value));
      } else if (key === 'title') {
        setParts.push('title = ?');
        values.push(value);
      } else if (key === 'status') {
        setParts.push('status = ?');
        values.push(value);
      }
    }
    
    setParts.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(sessionId);

    await this.db.run(`
      UPDATE sessions 
      SET ${setParts.join(', ')}
      WHERE id = ?
    `, values);
  }

  /**
   * Save a message to session
   */
  async saveMessage(sessionId, message, options = {}) {
    if (!this.initialized) await this.initialize();

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const messageData = {
      id: messageId,
      sessionId,
      role: message.role,
      content: message.content,
      timestamp: now,
      tokensUsed: options.tokensUsed || 0,
      responseTimeMs: options.responseTimeMs || 0,
      metadata: options.metadata || {}
    };

    await this.db.run(`
      INSERT INTO messages (id, session_id, role, content, timestamp, tokens_used, response_time_ms, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      messageData.id,
      messageData.sessionId,
      messageData.role,
      messageData.content,
      messageData.timestamp,
      messageData.tokensUsed,
      messageData.responseTimeMs,
      JSON.stringify(messageData.metadata)
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
      messageData.tokensUsed || 0,
      messageData.responseTimeMs || 0,
      now,
      sessionId
    ]);

    // Update session updated_at
    await this.db.run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);

    return messageData;
  }

  /**
   * Get messages for a session
   */
  async getMessages(sessionId, options = {}) {
    if (!this.initialized) await this.initialize();

    const { limit = 100, offset = 0, since } = options;
    
    let query = 'SELECT * FROM messages WHERE session_id = ?';
    const params = [sessionId];
    
    if (since) {
      query += ' AND timestamp > ?';
      params.push(since);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await this.db.all(query, params);
    
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      tokensUsed: row.tokens_used,
      responseTimeMs: row.response_time_ms,
      metadata: JSON.parse(row.metadata || '{}')
    })).reverse(); // Return in chronological order
  }

  /**
   * Get user's recent sessions
   */
  async getUserSessions(userId, limit = 20) {
    if (!this.initialized) await this.initialize();

    const rows = await this.db.all(`
      SELECT s.*, ss.total_messages, ss.total_tokens
      FROM sessions s
      LEFT JOIN session_stats ss ON s.id = ss.session_id
      WHERE s.user_id = ? AND s.status = 'active'
      ORDER BY s.updated_at DESC
      LIMIT ?
    `, [userId, limit]);

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      agentId: row.agent_id,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      totalMessages: row.total_messages || 0,
      totalTokens: row.total_tokens || 0
    }));
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId) {
    if (!this.initialized) await this.initialize();

    // Cascade delete will handle messages and stats
    await this.db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
    return true;
  }

  /**
   * Cleanup old sessions (optional maintenance)
   */
  async cleanupOldSessions(days = 30) {
    if (!this.initialized) await this.initialize();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString();

    const result = await this.db.run(`
      DELETE FROM sessions 
      WHERE status = 'completed' AND updated_at < ?
    `, [cutoffStr]);

    return { deletedSessions: result.changes };
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId) {
    if (!this.initialized) await this.initialize();

    const [session, stats] = await Promise.all([
      this.getSession(sessionId),
      this.db.get('SELECT * FROM session_stats WHERE session_id = ?', [sessionId])
    ]);

    if (!stats) return null;

    return {
      ...session,
      totalMessages: stats.total_messages,
      totalTokens: stats.total_tokens,
      totalDuration: stats.total_duration
    };
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();

// Export class for custom instances
export { SessionManager };