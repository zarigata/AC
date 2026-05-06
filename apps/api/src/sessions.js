import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const now = () => new Date().toISOString();

export class SessionManager {
  constructor(databasePath) {
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agentId TEXT NOT NULL,
        name TEXT NOT NULL,
        context TEXT NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS session_messages (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);
  }

  createSession(agentId, name, context = []) {
    const id = crypto.randomUUID();
    const timestamp = now();
    
    this.db.prepare(`
      INSERT INTO sessions (id, agentId, name, context, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      agentId,
      name,
      JSON.stringify(context),
      1,
      timestamp,
      timestamp
    );

    return {
      id,
      agentId,
      name,
      context,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  getSession(sessionId) {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      agentId: row.agentId,
      name: row.name,
      context: JSON.parse(row.context),
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  getSessionsForAgent(agentId) {
    const rows = this.db.prepare("SELECT * FROM sessions WHERE agentId = ? ORDER BY createdAt DESC").all(agentId);
    
    return rows.map(row => ({
      id: row.id,
      agentId: row.agentId,
      name: row.name,
      context: JSON.parse(row.context),
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
  }

  updateSession(sessionId, updates) {
    const existing = this.getSession(sessionId);
    if (!existing) {
      throw new Error(`Session with id ${sessionId} not found`);
    }

    const timestamp = now();
    const updateData = {
      ...updates,
      context: updates.context ? JSON.stringify(updates.context) : existing.context,
      updatedAt: timestamp
    };

    const setClause = Object.keys(updateData).map(field => `${field} = ?`).join(', ');
    const values = Object.values(updateData);
    values.push(sessionId);

    this.db.prepare(`UPDATE sessions SET ${setClause} WHERE id = ?`).run(...values);

    return this.getSession(sessionId);
  }

  deleteSession(sessionId) {
    const existing = this.getSession(sessionId);
    if (!existing) {
      throw new Error(`Session with id ${sessionId} not found`);
    }

    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return { success: true, deletedId: sessionId };
  }

  addMessage(sessionId, role, content, metadata = null) {
    const id = crypto.randomUUID();
    const timestamp = now();

    this.db.prepare(`
      INSERT INTO session_messages (id, sessionId, role, content, metadata, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      sessionId,
      role,
      content,
      metadata ? JSON.stringify(metadata) : null,
      timestamp
    );

    // Also update the session context
    const session = this.getSession(sessionId);
    if (session) {
      session.context.push({ role, content, metadata });
      this.updateSession(sessionId, { context: session.context });
    }

    return {
      id,
      sessionId,
      role,
      content,
      metadata,
      createdAt: timestamp
    };
  }

  getMessages(sessionId) {
    const rows = this.db.prepare("SELECT * FROM session_messages WHERE sessionId = ? ORDER BY createdAt ASC").all(sessionId);
    
    return rows.map(row => ({
      id: row.id,
      sessionId: row.sessionId,
      role: row.role,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.createdAt
    }));
  }

  getActiveSessionForAgent(agentId) {
    const row = this.db.prepare("SELECT * FROM sessions WHERE agentId = ? AND isActive = 1 ORDER BY createdAt DESC LIMIT 1").get(agentId);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      agentId: row.agentId,
      name: row.name,
      context: JSON.parse(row.context),
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}