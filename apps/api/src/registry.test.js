import assert from "node:assert/strict";
import test from "node:test";

import { AgentRegistry } from "./registry.js";

const createRegistry = () => new AgentRegistry({ databasePath: ":memory:" });

test("creates agents until capacity is reached", () => {
  const registry = createRegistry();

  for (let index = 0; index < 100; index += 1) {
    registry.createAgent({
      name: `Agent ${index + 1}`,
      purpose: "Capacity test for the machine registry.",
      provider: "openai",
      model: "gpt-5.4-mini",
      isolationMode: "isolated",
      maxConcurrentTasks: 1,
      peerAccess: false
    });
  }

  assert.equal(registry.listAgents().length, 100);
  assert.throws(
    () =>
      registry.createAgent({
        name: "Overflow",
        purpose: "This should not fit on the machine.",
        provider: "openai",
        model: "gpt-5.4-mini",
        isolationMode: "isolated",
        maxConcurrentTasks: 1,
        peerAccess: false
      }),
    /100 registered agents/
  );
});

test("rejects self-links", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "Solo",
    purpose: "Self-link validation check.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  assert.throws(
    () =>
      registry.createLink({
        sourceAgentId: agent.id,
        targetAgentId: agent.id,
        mode: "message"
      }),
    /cannot create a link to itself/
  );
});
