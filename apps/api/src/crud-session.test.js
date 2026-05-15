import assert from "node:assert/strict";
import test from "node:test";
import { AgentRegistry } from "./registry.js";

const createRegistry = () => new AgentRegistry({ databasePath: ":memory:" });

const sampleAgent = {
  name: "TestBot",
  purpose: "Testing the new CRUD and session endpoints.",
  provider: "openai",
  model: "gpt-5.4-mini",
  isolationMode: "isolated",
  maxConcurrentTasks: 2,
  peerAccess: false
};

/* ─── GET single agent ─── */
test("getAgent returns agent by id", () => {
  const registry = createRegistry();
  const agent = registry.createAgent(sampleAgent);
  const found = registry.getAgent(agent.id);
  assert.equal(found.name, "TestBot");
  assert.equal(found.id, agent.id);
});

test("getAgent returns null for unknown id", () => {
  const registry = createRegistry();
  assert.equal(registry.getAgent("00000000-0000-0000-0000-000000000000"), null);
});

/* ─── PATCH agent ─── */
test("updateAgent patches specified fields", () => {
  const registry = createRegistry();
  const agent = registry.createAgent(sampleAgent);
  const updated = registry.updateAgent(agent.id, { name: "RenamedBot", status: "running" });
  assert.equal(updated.name, "RenamedBot");
  assert.equal(updated.status, "running");
  assert.equal(updated.purpose, sampleAgent.purpose);
});

test("updateAgent returns null for unknown id", () => {
  const registry = createRegistry();
  // Use a properly formatted UUID that doesn't exist
  assert.equal(registry.updateAgent("12345678-abcd-1234-abcd-123456789abc", { name: "X" }), null);
});

/* ─── DELETE agent ─── */
test("deleteAgent removes agent and returns true", () => {
  const registry = createRegistry();
  const agent = registry.createAgent(sampleAgent);
  assert.equal(registry.deleteAgent(agent.id), true);
  assert.equal(registry.getAgent(agent.id), null);
});

test("deleteAgent returns false for unknown id", () => {
  const registry = createRegistry();
  assert.equal(registry.deleteAgent("00000000-0000-0000-0000-000000000000"), false);
});

/* ─── DELETE link ─── */
test("deleteLink removes a link", () => {
  const registry = createRegistry();
  const a = registry.createAgent({ ...sampleAgent, name: "AgentA" });
  const b = registry.createAgent({ ...sampleAgent, name: "AgentB" });
  registry.createLink({ sourceAgentId: a.id, targetAgentId: b.id, mode: "observe", direction: "outbound" });
  assert.equal(registry.deleteLink({ sourceAgentId: a.id, targetAgentId: b.id }), true);
  assert.equal(registry.listLinks().length, 0);
});

/* ─── Sessions ─── */
test("createSession and listSessions work", () => {
  const registry = createRegistry();
  const agent = registry.createAgent(sampleAgent);
  const session = registry.createSession(agent.id, { title: "First chat" });
  assert.equal(session.agentId, agent.id);
  assert.equal(session.title, "First chat");

  const sessions = registry.listSessions(agent.id);
  assert.equal(sessions.sessions.length, 1);
  assert.equal(sessions.sessions[0].id, session.id);
});

test("createSession returns null for unknown agent", () => {
  const registry = createRegistry();
  assert.equal(registry.createSession("00000000-0000-0000-0000-000000000000"), null);
});

/* ─── Messages ─── */
test("createMessage and listMessages work", () => {
  const registry = createRegistry();
  const agent = registry.createAgent(sampleAgent);
  const session = registry.createSession(agent.id);

  const msg = registry.createMessage(agent.id, session.id, {
    role: "user",
    content: "Hello world",
    tokensIn: 5,
    tokensOut: 0
  });

  assert.equal(msg.role, "user");
  assert.equal(msg.content, "Hello world");
  assert.equal(msg.tokensIn, 5);

  const messages = registry.listMessages(agent.id, session.id);
  assert.equal(messages.messages.length, 1);
});

test("createMessage returns null for unknown session", () => {
  const registry = createRegistry();
  assert.equal(registry.createMessage("00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000", {}), null);
});

/* ─── Usage Stats ─── */
test("getAgentUsage returns token and session counts", () => {
  const registry = createRegistry();
  const agent = registry.createAgent(sampleAgent);
  const session = registry.createSession(agent.id);

  registry.createMessage(agent.id, session.id, { role: "user", content: "Hi", tokensIn: 3 });
  registry.createMessage(agent.id, session.id, { role: "assistant", content: "Hey!", tokensOut: 5 });

  const usage = registry.getAgentUsage(agent.id);
  assert.equal(usage.sessions, 1);
  assert.equal(usage.totalMessages, 2);
  assert.equal(usage.totalTokensIn, 3);
  assert.equal(usage.totalTokensOut, 5);
});

test("getAgentUsage returns null for unknown agent", () => {
  const registry = createRegistry();
  assert.equal(registry.getAgentUsage("00000000-0000-0000-0000-000000000000"), null);
});
