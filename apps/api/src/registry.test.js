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
    CLAWFORGE_OPENAI_BASE_URL: "https://gateway.example/v1"
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