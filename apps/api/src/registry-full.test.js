import assert from "node:assert/strict";
import test from "node:test";

import { AgentRegistry } from "./registry.js";

const createRegistry = () => new AgentRegistry({ databasePath: ":memory:" });

test("creates and retrieves agents", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "Test Agent",
    purpose: "Test purpose for CRUD operations.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 2,
    peerAccess: false
  });

  const retrieved = registry.getAgent(agent.id);
  assert.equal(retrieved.id, agent.id);
  assert.equal(retrieved.name, "Test Agent");
  assert.equal(retrieved.status, "idle");
});

test("updates agent properties", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "Original Name",
    purpose: "Original purpose.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  const updated = registry.updateAgent(agent.id, {
    name: "Updated Name",
    maxConcurrentTasks: 4
  });

  assert.equal(updated.name, "Updated Name");
  assert.equal(updated.maxConcurrentTasks, 4);
  assert.equal(updated.purpose, "Original purpose."); // Unchanged
});

test("rejects updates to immutable fields", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "Test Agent",
    purpose: "Test purpose.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  // Try to update id or createdAt
  assert.throws(
    () => registry.updateAgent(agent.id, { id: "fake-id" }),
    /No fields provided for update/
  );

  // Try to update with invalid provider
  assert.throws(
    () => registry.updateAgent(agent.id, { provider: "invalid-provider" }),
    /Unknown provider id/
  );
});

test("deletes agents and their links", () => {
  const registry = createRegistry();
  const agent1 = registry.createAgent({
    name: "Agent 1",
    purpose: "Test agent 1.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  const agent2 = registry.createAgent({
    name: "Agent 2",
    purpose: "Test agent 2.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  // Create a link
  registry.createLink({
    sourceAgentId: agent1.id,
    targetAgentId: agent2.id,
    mode: "delegate"
  });

  // Delete agent1 - should also delete the link
  const result = registry.deleteAgent(agent1.id);
  assert.equal(result.success, true);
  assert.equal(result.deletedId, agent1.id);

  // Verify agent1 is gone
  assert.equal(registry.getAgent(agent1.id), null);

  // Verify agent2 still exists
  assert.ok(registry.getAgent(agent2.id));

  // Verify link is gone
  const links = registry.listLinks();
  assert.equal(links.length, 0);
});

test("updates agent status with valid transitions", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "Test Agent",
    purpose: "Test purpose.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  // Test status transitions
  let updated = registry.updateAgentStatus(agent.id, "running");
  assert.equal(updated.status, "running");

  updated = registry.updateAgentStatus(agent.id, "paused");
  assert.equal(updated.status, "paused");

  updated = registry.updateAgentStatus(agent.id, "error");
  assert.equal(updated.status, "error");

  updated = registry.updateAgentStatus(agent.id, "idle");
  assert.equal(updated.status, "idle");
});

test("rejects invalid status updates", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "Test Agent",
    purpose: "Test purpose.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  // Try invalid status
  assert.throws(
    () => registry.updateAgentStatus(agent.id, "invalid-status"),
    /Status must be one of/
  );
});

test("creates and deletes links", () => {
  const registry = createRegistry();
  const agent1 = registry.createAgent({
    name: "Agent 1",
    purpose: "Test agent 1.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  const agent2 = registry.createAgent({
    name: "Agent 2",
    purpose: "Test agent 2.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  const link = registry.createLink({
    sourceAgentId: agent1.id,
    targetAgentId: agent2.id,
    mode: "delegate"
  });

  assert.equal(link.sourceAgentId, agent1.id);
  assert.equal(link.targetAgentId, agent2.id);

  // Delete the link
  const result = registry.deleteLink(agent1.id, agent2.id);
  assert.equal(result.success, true);
  assert.deepEqual(result.deletedLink, { sourceAgentId: agent1.id, targetAgentId: agent2.id });

  // Verify link is gone
  const links = registry.listLinks();
  assert.equal(links.length, 0);
});

test("rejects deletion of non-existent agents and links", () => {
  const registry = createRegistry();
  
  // Try to delete non-existent agent
  assert.throws(
    () => registry.deleteAgent("non-existent-id"),
    /Agent with id non-existent-id not found/
  );

  // Create agents
  const agent1 = registry.createAgent({
    name: "Agent 1",
    purpose: "Test agent 1.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  const agent2 = registry.createAgent({
    name: "Agent 2",
    purpose: "Test agent 2.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  // Try to delete non-existent link
  assert.throws(
    () => registry.deleteLink(agent1.id, "non-existent-target"),
    /Link from agent .* to .* not found/
  );
});

test("handles large agent property updates", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "Original",
    purpose: "Original purpose.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  // Update with long strings (max lengths)
  const longName = "A".repeat(80);
  const longPurpose = "B".repeat(240);
  
  const updated = registry.updateAgent(agent.id, {
    name: longName,
    purpose: longPurpose,
    maxConcurrentTasks: 32
  });

  assert.equal(updated.name, longName);
  assert.equal(updated.purpose, longPurpose);
  assert.equal(updated.maxConcurrentTasks, 32);
});

test("rejects updates with invalid field values", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "Test Agent",
    purpose: "Test purpose.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  // Invalid maxConcurrentTasks
  assert.throws(
    () => registry.updateAgent(agent.id, { maxConcurrentTasks: 99 }),
    /maxConcurrentTasks must be an integer between 1 and 32/
  );

  // Invalid isolationMode
  assert.throws(
    () => registry.updateAgent(agent.id, { isolationMode: "invalid-mode" }),
    /isolationMode must be one of/
  );
});