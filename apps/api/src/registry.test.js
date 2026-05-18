import assert from "node:assert/strict";
import test from "node:test";

import {
  firstWaveProviderIds,
  getProviderReadinessSummary,
  listProviders,
  listProviderConnections,
  parseCreateAgentInput
} from "../../../packages/shared/src/index.js";
import { AgentRegistry } from "./registry.js";
import { applyPreset, getPreset } from "./presets.js";

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

test("ships a 50-provider catalog including ollama, ollama cloud, and z.ai", () => {
  const providers = listProviders();
  const ids = new Set(providers.map((provider) => provider.id));

  assert.equal(providers.length, 50);
  assert.equal(ids.has("ollama"), true);
  assert.equal(ids.has("ollama-cloud"), true);
  assert.equal(ids.has("z-ai"), true);
});

test("builds first-wave provider readiness in the required order", () => {
  const connections = listProviderConnections({
    ANTHROPIC_API_KEY: "anthropic-key",
    OLLAMA_BASE_URL: "http://localhost:11434",
    OPENAI_API_KEY: "openai-key"
  });

  assert.deepEqual(
    connections.slice(0, firstWaveProviderIds.length).map((provider) => provider.id),
    firstWaveProviderIds
  );

  const readiness = getProviderReadinessSummary({
    ANTHROPIC_API_KEY: "anthropic-key",
    OLLAMA_BASE_URL: "http://localhost:11434",
    OPENAI_API_KEY: "openai-key"
  });

  assert.equal(readiness.firstWave.total, 5);
  assert.equal(readiness.firstWave.configured, 3);
  assert.equal(readiness.firstWave.pendingCount, 2);
  assert.equal(readiness.firstWave.ready.length, 3);
  assert.equal(readiness.firstWave.pending.length, 2);
});

test("marks first-wave provider connection requirements clearly", () => {
  const [ollama, ollamaCloud, zAi, anthropic, openai] = listProviderConnections({
    ZAZI_OPENAI_BASE_URL: "https://gateway.example/v1"
  });

  assert.equal(ollama.transport, "local-http");
  assert.equal(ollama.configured, false);
  assert.deepEqual(ollama.requiredEnv, ["OLLAMA_BASE_URL"]);
  assert.equal(ollama.suggestedModel, "qwen3");

  assert.equal(ollamaCloud.transport, "cloud-http");
  assert.deepEqual(ollamaCloud.requiredEnv, ["OLLAMA_CLOUD_API_KEY"]);

  assert.equal(zAi.id, "z-ai");
  assert.equal(anthropic.id, "anthropic");
  assert.equal(openai.id, "openai");
  assert.equal(openai.baseUrl, "https://gateway.example/v1");
  assert.equal(openai.suggestedModel, "gpt-5.4-mini");
});

test("rejects unknown providers during agent creation", () => {
  assert.throws(
    () =>
      parseCreateAgentInput({
        name: "Mystery",
        purpose: "Attempt to use a provider that is not in the catalog.",
        provider: "totally-made-up",
        model: "imaginary-1",
        isolationMode: "isolated",
        maxConcurrentTasks: 1,
        peerAccess: false
      }),
    /Unknown provider id/
  );
});

test("seed creates 3-level hierarchy", () => {
  const registry = createRegistry();
  registry.seed();

  const agents = registry.listAgents();
  assert.equal(agents.length, 3);

  const director = agents.find((a) => a.name === "Orchestrator Director");
  const researcher = agents.find((a) => a.name === "Agent Researcher");
  const scraper = agents.find((a) => a.name === "Sub-agent WebScraper");

  assert.ok(director);
  assert.ok(researcher);
  assert.ok(scraper);

  assert.equal(director.level, "orchestrator");
  assert.equal(director.parentId, null);
  assert.equal(director.maxSubAgents, 10);

  assert.equal(researcher.level, "agent");
  assert.equal(researcher.parentId, director.id);
  assert.equal(researcher.maxSubAgents, 5);

  assert.equal(scraper.level, "sub-agent");
  assert.equal(scraper.parentId, researcher.id);
  assert.equal(scraper.maxSubAgents, 0);

  const hierarchy = registry.getHierarchy();
  assert.equal(hierarchy.length, 1);
  assert.equal(hierarchy[0].id, director.id);
  assert.equal(hierarchy[0].children.length, 1);
  assert.equal(hierarchy[0].children[0].id, researcher.id);
  assert.equal(hierarchy[0].children[0].children.length, 1);
  assert.equal(hierarchy[0].children[0].children[0].id, scraper.id);
});

test("parent creation enforces maxSubAgents limit", () => {
  const registry = createRegistry();
  const parent = registry.createAgent({
    name: "Parent",
    purpose: "A parent with limited children.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "mesh",
    maxConcurrentTasks: 1,
    peerAccess: false,
    level: "agent",
    maxSubAgents: 2
  });

  registry.createAgent({
    name: "Child1",
    purpose: "First child.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "mesh",
    maxConcurrentTasks: 1,
    peerAccess: false,
    level: "sub-agent",
    parentId: parent.id
  });

  registry.createAgent({
    name: "Child2",
    purpose: "Second child.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "mesh",
    maxConcurrentTasks: 1,
    peerAccess: false,
    level: "sub-agent",
    parentId: parent.id
  });

  assert.throws(
    () =>
      registry.createAgent({
        name: "Child3",
        purpose: "Third child exceeding limit.",
        provider: "openai",
        model: "gpt-5.4-mini",
        isolationMode: "mesh",
        maxConcurrentTasks: 1,
        peerAccess: false,
        level: "sub-agent",
        parentId: parent.id
      }),
    /maxSubAgents/
  );
});

test("agent messaging with isolation rules", () => {
  const registry = createRegistry();
  registry.seed();

  const agents = registry.listAgents();
  const director = agents.find((a) => a.name === "Orchestrator Director");
  const researcher = agents.find((a) => a.name === "Agent Researcher");
  const scraper = agents.find((a) => a.name === "Sub-agent WebScraper");

  const msg = registry.sendMessage({
    fromAgentId: director.id,
    toAgentId: researcher.id,
    content: "Please research this topic."
  });
  assert.equal(msg.status, "pending");

  // scraper is mesh and linked to researcher via delegate link, so messaging succeeds
  const msg2 = registry.sendMessage({
    fromAgentId: scraper.id,
    toAgentId: researcher.id,
    content: "Scraper update to researcher."
  });
  assert.equal(msg2.status, "pending");

  // create an isolated agent to test selective isolation enforcement
  const isolatedAgent = registry.createAgent({
    name: "Isolated Agent",
    purpose: "Should not send or receive messages.",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });

  assert.throws(
    () =>
      registry.sendMessage({
        fromAgentId: isolatedAgent.id,
        toAgentId: researcher.id,
        content: "Blocked message."
      }),
    /isolated/i
  );

  assert.throws(
    () =>
      registry.sendMessage({
        fromAgentId: director.id,
        toAgentId: isolatedAgent.id,
        content: "Blocked message."
      }),
    /isolated/i
  );
});

test("presets apply template fields and preserve overrides", () => {
  const preset = getPreset("coder");
  assert.equal(preset.level, "agent");
  assert.equal(preset.isolationMode, "selective");

  const merged = applyPreset({ name: "Override", model: "custom-v1", peerAccess: false }, "coder");
  assert.equal(merged.name, "Override");
  assert.equal(merged.model, "custom-v1");
  assert.equal(merged.peerAccess, false);
  assert.equal(merged.level, "agent");
  assert.equal(merged.flavor, "coder");
  assert.equal(merged.isolationMode, "selective");
});

test("topology includes hierarchy", () => {
  const registry = createRegistry();
  registry.seed();

  const topology = registry.getTopology();
  assert.ok(topology.hierarchy);
  assert.equal(topology.hierarchy.length, 1);
  assert.ok(topology.hierarchy[0].children);
});
