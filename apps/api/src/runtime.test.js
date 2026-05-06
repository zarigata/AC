import { strictEqual } from "node:assert";
import { test } from "node:test";

import { AgentRuntime } from "./runtime.js";

test("AgentRuntime can be created", () => {
  const runtime = new AgentRuntime();
  strictEqual(runtime instanceof AgentRuntime, true);
});

test("AgentRuntime throws error for unsupported provider", async () => {
  const runtime = new AgentRuntime();
  const agent = {
    id: "test",
    name: "Test Agent",
    provider: "unsupported-provider",
    model: "test-model"
  };
  
  await Promise.all([
    runtime.executeAgent(agent, [{ role: "user", content: "Hello" }])
      .then(() => strictEqual(true, false, "Should have thrown error"))
      .catch(error => strictEqual(error.message, "Provider unsupported-provider not yet implemented for runtime execution"))
  ]);
});

test("OpenAI provider throws error without API key", async () => {
  const runtime = new AgentRuntime({});
  const agent = {
    id: "test",
    name: "Test Agent",
    provider: "openai",
    model: "gpt-4"
  };
  
  await Promise.all([
    runtime.executeAgent(agent, [{ role: "user", content: "Hello" }])
      .then(() => strictEqual(true, false, "Should have thrown error"))
      .catch(error => strictEqual(error.message, "OPENAI_API_KEY environment variable is required"))
  ]);
});

test("Anthropic provider throws error without API key", async () => {
  const runtime = new AgentRuntime({});
  const agent = {
    id: "test",
    name: "Test Agent", 
    provider: "anthropic",
    model: "claude-3"
  };
  
  await Promise.all([
    runtime.executeAgent(agent, [{ role: "user", content: "Hello" }])
      .then(() => strictEqual(true, false, "Should have thrown error"))
      .catch(error => strictEqual(error.message, "ANTHROPIC_API_KEY environment variable is required"))
  ]);
});

test("Ollama provider throws error without base URL", async () => {
  const runtime = new AgentRuntime({});
  const agent = {
    id: "test",
    name: "Test Agent",
    provider: "ollama", 
    model: "llama2"
  };
  
  await Promise.all([
    runtime.executeAgent(agent, [{ role: "user", content: "Hello" }])
      .then(() => strictEqual(true, false, "Should have thrown error"))
      .catch(error => strictEqual(error.message, "OLLAMA_BASE_URL environment variable is required"))
  ]);
});

test("Z.AI provider throws error without API key", async () => {
  const runtime = new AgentRuntime({});
  const agent = {
    id: "test",
    name: "Test Agent",
    provider: "z-ai",
    model: "glm-4"
  };
  
  await Promise.all([
    runtime.executeAgent(agent, [{ role: "user", content: "Hello" }])
      .then(() => strictEqual(true, false, "Should have thrown error"))
      .catch(error => strictEqual(error.message, "ZAI_API_KEY environment variable is required"))
  ]);
});

test("Provider health checks work", async () => {
  const runtime = new AgentRuntime({});
  
  // Test with no API keys
  const openaiHealth = await runtime.checkProviderHealth("openai");
  strictEqual(typeof openaiHealth, "object");
  strictEqual(openaiHealth.healthy, false);
  
  const anthropicHealth = await runtime.checkProviderHealth("anthropic");  
  strictEqual(typeof anthropicHealth, "object");
  strictEqual(anthropicHealth.healthy, false);
  
  const ollamaHealth = await runtime.checkProviderHealth("ollama");
  strictEqual(typeof ollamaHealth, "object");
  // This might be true if Ollama is running locally
  strictEqual(typeof ollamaHealth.healthy, "boolean");
});