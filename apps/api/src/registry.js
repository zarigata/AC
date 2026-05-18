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
        level TEXT NOT NULL DEFAULT 'agent',
        parentId TEXT,
        maxSubAgents INTEGER NOT NULL DEFAULT 5,
        flavor TEXT,
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

      CREATE TABLE IF NOT EXISTS agent_messages (
        id TEXT PRIMARY KEY,
        fromAgentId TEXT NOT NULL,
        toAgentId TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        status TEXT NOT NULL DEFAULT 'pending',
        createdAt TEXT NOT NULL,
        FOREIGN KEY (fromAgentId) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (toAgentId) REFERENCES agents(id) ON DELETE CASCADE
      );
    `);
  }

  seed() {
    if (this.listAgents().length > 0) {
      return;
    }

    const director = this.createAgent({
      name: "Orchestrator Director",
      purpose: "Top-level coordinator that breaks work into tasks and supervises runs.",
      provider: "openai",
      model: "gpt-5.4",
      isolationMode: "selective",
      maxConcurrentTasks: 8,
      peerAccess: true,
      level: "orchestrator"
    });

    const researcher = this.createAgent({
      name: "Agent Researcher",
      purpose: "Collect docs, compare backends, and prepare implementation briefs.",
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      isolationMode: "selective",
      maxConcurrentTasks: 4,
      peerAccess: true,
      level: "agent",
      parentId: director.id
    });

    const scraper = this.createAgent({
      name: "Sub-agent WebScraper",
      purpose: "Fetch and parse web pages for data extraction.",
      provider: "anthropic",
      model: "claude-sonnet-4.5",
      isolationMode: "mesh",
      maxConcurrentTasks: 2,
      peerAccess: false,
      level: "sub-agent",
      parentId: researcher.id
    });

    this.createLink({
      sourceAgentId: director.id,
      targetAgentId: researcher.id,
      mode: "delegate"
    });

    this.createLink({
      sourceAgentId: researcher.id,
      targetAgentId: scraper.id,
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

    if (parsed.parentId) {
      const parent =
        this.db.prepare("SELECT * FROM agents WHERE id = ?").get(parsed.parentId) ??
        null;
      if (!parent) {
        throw new Error("Parent agent does not exist.");
      }
      const currentChildren = this.db
        .prepare("SELECT COUNT(*) as count FROM agents WHERE parentId = ?")
        .get(parsed.parentId);
      if (currentChildren.count >= parent.maxSubAgents) {
        throw new Error("Parent agent has reached its maxSubAgents limit.");
      }
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
            maxConcurrentTasks, peerAccess, level, parentId, maxSubAgents,
            flavor, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        agent.level,
        agent.parentId,
        agent.maxSubAgents,
        agent.flavor,
        agent.createdAt,
        agent.updatedAt
      );

    return agent;
  }

  deleteAgent(id) {
    const agent = this.db.prepare("SELECT id FROM agents WHERE id = ?").get(id);
    if (!agent) {
      throw new Error("Agent not found.");
    }
    this.db.prepare("DELETE FROM agents WHERE id = ?").run(id);
    return { id };
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
      links,
      hierarchy: this.getHierarchy()
    };
  }

  getHierarchy() {
    const agents = this.db.prepare("SELECT * FROM agents ORDER BY createdAt ASC").all();
    const agentMap = new Map();
    const roots = [];

    for (const row of agents) {
      const node = {
        ...row,
        peerAccess: Boolean(row.peerAccess),
        children: []
      };
      agentMap.set(row.id, node);
    }

    for (const node of agentMap.values()) {
      if (node.parentId && agentMap.has(node.parentId)) {
        agentMap.get(node.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  sendMessage(input) {
    const { fromAgentId, toAgentId, content, type = "text" } = input;
    if (!fromAgentId || !toAgentId || !content) {
      throw new Error("fromAgentId, toAgentId, and content are required.");
    }

    const agents = this.listAgents();
    const fromAgent = agents.find((a) => a.id === fromAgentId);
    const toAgent = agents.find((a) => a.id === toAgentId);
    if (!fromAgent || !toAgent) {
      throw new Error("Both agents must exist.");
    }

    if (fromAgent.isolationMode === "isolated" || toAgent.isolationMode === "isolated") {
      throw new Error("Isolated agents cannot send or receive messages.");
    }

    if (fromAgent.isolationMode === "selective" || toAgent.isolationMode === "selective") {
      const linked = this.db
        .prepare(
          "SELECT COUNT(*) as count FROM agent_links WHERE (sourceAgentId = ? AND targetAgentId = ?) OR (sourceAgentId = ? AND targetAgentId = ?)"
        )
        .get(fromAgentId, toAgentId, toAgentId, fromAgentId);
      if (linked.count === 0) {
        throw new Error("Selective agents can only message linked agents.");
      }
    }

    const id = crypto.randomUUID();
    const createdAt = now();
    this.db
      .prepare(
        "INSERT INTO agent_messages (id, fromAgentId, toAgentId, content, type, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(id, fromAgentId, toAgentId, content, type, "pending", createdAt);

    return { id, fromAgentId, toAgentId, content, type, status: "pending", createdAt };
  }

  getMessagesForAgent(agentId) {
    const rows = this.db
      .prepare(
        "SELECT * FROM agent_messages WHERE fromAgentId = ? OR toAgentId = ? ORDER BY createdAt ASC"
      )
      .all(agentId, agentId);
    return rows;
  }

  getConversation(agent1, agent2) {
    const rows = this.db
      .prepare(
        "SELECT * FROM agent_messages WHERE (fromAgentId = ? AND toAgentId = ?) OR (fromAgentId = ? AND toAgentId = ?) ORDER BY createdAt ASC"
      )
      .all(agent1, agent2, agent2, agent1);
    return rows;
  }
}
