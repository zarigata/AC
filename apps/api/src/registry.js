import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  agentLinkModeValues,
  parseAgent,
  parseCreateAgentInput,
  parseCreateLinkInput
} from "../../../packages/shared/src/index.js";

const now = () => new Date().toISOString();

export class AgentRegistry {
  constructor(options) {
    mkdirSync(dirname(options.databasePath), { recursive: true });
    this.db = new DatabaseSync(options.databasePath);
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

      CREATE TABLE IF NOT EXISTS agent_links (
        sourceAgentId TEXT NOT NULL,
        targetAgentId TEXT NOT NULL,
        mode TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (sourceAgentId, targetAgentId),
        FOREIGN KEY (sourceAgentId) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (targetAgentId) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agentId TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
      );

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
    `);
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
      isolationMode: "selective",
      maxConcurrentTasks: 8,
      peerAccess: true
    });

    const researcher = this.createAgent({
      name: "Researcher",
      purpose: "Collect docs, compare backends, and prepare implementation briefs.",
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      isolationMode: "isolated",
      maxConcurrentTasks: 4,
      peerAccess: false
    });

    this.createLink({
      sourceAgentId: coordinator.id,
      targetAgentId: researcher.id,
      mode: "delegate"
    });
  }

  listAgents() {
    const rows = this.db
      .prepare("SELECT * FROM agents ORDER BY createdAt ASC")
      .all();

    return rows.map((row) =>
      parseAgent({
        ...row,
        peerAccess: Boolean(row.peerAccess)
      })
    );
  }

  createAgent(input) {
    const parsed = parseCreateAgentInput(input);

    if (this.listAgents().length >= 100) {
      throw new Error("This machine already has 100 registered agents.");
    }

    const id = crypto.randomUUID();
    const timestamp = now();
    const agent = {
      id,
      status: "idle",
      createdAt: timestamp,
      updatedAt: timestamp,
      ...parsed
    };

    this.db
      .prepare(
        `
          INSERT INTO agents (
            id, name, purpose, status, provider, model, isolationMode,
            maxConcurrentTasks, peerAccess, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
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

    return agent;
  }

  listLinks() {
    return this.db
      .prepare("SELECT * FROM agent_links ORDER BY createdAt ASC")
      .all();
  }

  createLink(input) {
    const parsed = parseCreateLinkInput(input);

    if (parsed.sourceAgentId === parsed.targetAgentId) {
      throw new Error("An agent cannot create a link to itself.");
    }

    const agentIds = new Set(this.listAgents().map((agent) => agent.id));
    if (!agentIds.has(parsed.sourceAgentId) || !agentIds.has(parsed.targetAgentId)) {
      throw new Error("Both agents must exist before creating a link.");
    }

    const createdAt = now();
    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO agent_links (
            sourceAgentId, targetAgentId, mode, createdAt
          ) VALUES (?, ?, ?, ?)
        `
      )
      .run(parsed.sourceAgentId, parsed.targetAgentId, parsed.mode, createdAt);

    return {
      ...parsed,
      createdAt
    };
  }

  getTopology() {
    const agents = this.listAgents();
    const links = this.listLinks();

    return {
      capacity: {
        maxAgentsPerMachine: 100,
        activeAgents: agents.length,
        supportedLinkModes: agentLinkModeValues
      },
      agents,
      links
    };
  }

  /* ─── Single Agent CRUD ─── */

  getAgent(id) {
    const row = this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
    if (!row) return null;
    return parseAgent({ ...row, peerAccess: Boolean(row.peerAccess) });
  }

  updateAgent(id, updates) {
    const existing = this.getAgent(id);
    if (!existing) return null;

    const allowed = ["name", "purpose", "status", "provider", "model", "isolationMode", "maxConcurrentTasks", "peerAccess"];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (key in updates) {
        fields.push(`${key} = ?`);
        values.push(key === "peerAccess" ? Number(updates[key]) : updates[key]);
      }
    }

    if (fields.length === 0) return existing;

    fields.push("updatedAt = ?");
    values.push(now());
    values.push(id);

    this.db.prepare(`UPDATE agents SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getAgent(id);
  }

  deleteAgent(id) {
    const existing = this.getAgent(id);
    if (!existing) return false;
    this.db.prepare("DELETE FROM agents WHERE id = ?").run(id);
    return true;
  }

  /* ─── Link Delete ─── */

  deleteLink(input) {
    const result = this.db
      .prepare("DELETE FROM agent_links WHERE sourceAgentId = ? AND targetAgentId = ?")
      .run(input.sourceAgentId, input.targetAgentId);
    return result.changes > 0;
  }

  /* ─── Sessions ─── */

  listSessions(agentId) {
    return this.db
      .prepare("SELECT * FROM sessions WHERE agentId = ? ORDER BY createdAt DESC")
      .all(agentId);
  }

  createSession(agentId, input = {}) {
    const agent = this.getAgent(agentId);
    if (!agent) return null;

    const id = crypto.randomUUID();
    const timestamp = now();
    const session = {
      id,
      agentId,
      title: input.title || "New session",
      model: input.model || agent.model,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.db
      .prepare("INSERT INTO sessions (id, agentId, title, model, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(session.id, session.agentId, session.title, session.model, session.createdAt, session.updatedAt);

    return session;
  }

  /* ─── Messages ─── */

  listMessages(agentId, sessionId) {
    return this.db
      .prepare(
        `SELECT m.* FROM messages m
         JOIN sessions s ON m.sessionId = s.id
         WHERE s.agentId = ? AND m.sessionId = ?
         ORDER BY m.createdAt ASC`
      )
      .all(agentId, sessionId);
  }

  createMessage(agentId, sessionId, input) {
    const session = this.db.prepare("SELECT * FROM sessions WHERE id = ? AND agentId = ?").get(sessionId, agentId);
    if (!session) return null;

    const id = crypto.randomUUID();
    const timestamp = now();
    const message = {
      id,
      sessionId,
      role: input.role || "user",
      content: input.content || "",
      tokensIn: input.tokensIn || 0,
      tokensOut: input.tokensOut || 0,
      model: input.model || session.model,
      createdAt: timestamp
    };

    this.db
      .prepare("INSERT INTO messages (id, sessionId, role, content, tokensIn, tokensOut, model, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(message.id, message.sessionId, message.role, message.content, message.tokensIn, message.tokensOut, message.model, message.createdAt);

    this.db.prepare("UPDATE sessions SET updatedAt = ? WHERE id = ?").run(timestamp, sessionId);

    return message;
  }

  /* ─── Usage Stats ─── */

  getAgentUsage(agentId) {
    const agent = this.getAgent(agentId);
    if (!agent) return null;

    const sessionCount = this.db.prepare("SELECT COUNT(*) as count FROM sessions WHERE agentId = ?").get(agentId).count;
    const tokenStats = this.db
      .prepare(
        `SELECT COALESCE(SUM(tokensIn), 0) as totalTokensIn,
                COALESCE(SUM(tokensOut), 0) as totalTokensOut,
                COUNT(*) as totalMessages
         FROM messages m
         JOIN sessions s ON m.sessionId = s.id
         WHERE s.agentId = ?`
      )
      .get(agentId);

    return {
      agentId,
      sessions: sessionCount,
      totalTokensIn: tokenStats.totalTokensIn,
      totalTokensOut: tokenStats.totalTokensOut,
      totalMessages: tokenStats.totalMessages
    };
  }
}
