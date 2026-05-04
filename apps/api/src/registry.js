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
}
