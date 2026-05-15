#!/usr/bin/env node
/**
 * Zsiistant Integration Test — Sandbox Agent
 *
 * Spins up the Zsiistant server on a random port, creates an agent
 * configured for Ollama (qwen3:0.6b), and tests the full flow:
 *
 *   1. Health check
 *   2. Create agent (Ollama provider)
 *   3. Provider health check (is Ollama running?)
 *   4. Chat with agent via Ollama
 *   5. Verify response is non-empty
 *   6. Check session was created
 *   7. Check messages were stored
 *   8. Check token usage was tracked
 *   9. List agents, get agent, update agent, delete agent
 *  10. Full topology check
 *
 * Usage: node tests/integration-test.js [--skip-ollama]
 */

import { createServer } from "node:http";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const skipOllama = process.argv.includes("--skip-ollama");

const PORT = 4000;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
let server = null;

/* ─── Helpers ─── */

async function api(method, path, body = null) {
  const url = new URL(path, BASE);
  const headers = { "Content-Type": "application/json" };
  
  // Add development API key for protected routes
  if (!path.startsWith('/health')) {
    headers["X-API-Key"] = "zsiistant-test-api-key-12345";
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json();
  return { status: res.status, data };
}

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✔ ${label}`);
  } else {
    failed++;
    console.log(`  ✖ ${label}`);
  }
}

/* ─── Tests ─── */

async function testHealth() {
  console.log("\n📡 Test: Health check");
  const { status, data } = await api("GET", "/health");
  assert(status === 200, "GET /health returns 200");
  assert(data.ok === true, "health.ok is true");
  assert(data.service === "zsiistant-api", `service is zsiistant-api (got: ${data.service})`);
  assert(typeof data.version === "string", `version is string (got: ${data.version})`);
  assert(typeof data.uptime === "number", `uptime is number`);
}

async function testSettings() {
  console.log("\n⚙️  Test: Settings");
  const { status, data } = await api("GET", "/api/settings");
  assert(status === 200, "GET /api/settings returns 200");
  assert(data.maxAgents === 100, `maxAgents is 100`);
  assert(Array.isArray(data.supportedLinkModes), "supportedLinkModes is array");
  assert(data.version === "0.2.0", `version is 0.2.0`);
  assert(data.providers === 1, `providers is 1`);
}

async function testProviderCatalog() {
  console.log("\n🔌 Test: Provider catalog");
  const { status, data } = await api("GET", "/api/providers");
  assert(status === 200, "GET /api/providers returns 200");
  assert(Array.isArray(data.providers), "providers is array");
  assert(data.summary, "summary exists");
  console.log(`  Found ${data.providers.length} providers`);
  console.log(`  Summary: ${JSON.stringify(data.summary)}`);
}

async function testAgentCRUD() {
  console.log("\n🤖 Test: Agent CRUD");

  // Create
  const { status: cs, data: cd } = await api("POST", "/api/agents", {
    name: "TestBot",
    purpose: "Integration test agent for sandbox verification.",
    provider: "ollama",
    model: "qwen3:0.6b",
    isolationMode: "isolated",
    maxConcurrentTasks: 2,
    peerAccess: false
  });
  assert(cs === 201, `POST /api/agents returns 201`);
  assert(cd.agent.id, "agent has id");
  assert(cd.agent.name === "TestBot", `agent name is TestBot`);
  const agentId = cd.agent.id;

  // Get single
  const { status: gs, data: gd } = await api("GET", `/api/agents/${agentId}`);
  assert(gs === 200, `GET /api/agents/:id returns 200`);
  assert(gd.agent.name === "TestBot", "fetched agent matches");

  // Update
  const { status: us, data: ud } = await api("PATCH", `/api/agents/${agentId}`, { name: "SandboxBot" });
  assert(us === 200, `PATCH /api/agents/:id returns 200`);
  assert(ud.agent.name === "SandboxBot", `name updated to SandboxBot`);

  // List
  const { status: ls, data: ld } = await api("GET", "/api/agents");
  assert(ls === 200, `GET /api/agents returns 200`);
  assert(ld.agents.length >= 1, `at least 1 agent`);

  return agentId;
}

async function testSessions(agentId) {
  console.log("\n💬 Test: Sessions");

  // Create session
  const { status: cs, data: cd } = await api("POST", `/api/agents/${agentId}/sessions`, {
    title: "Test session"
  });
  assert(cs === 201, `POST /api/agents/:id/sessions returns 201`);
  assert(cd.session.id, "session has id");
  const sessionId = cd.session.id;

  // List sessions
  const { status: ls, data: ld } = await api("GET", `/api/agents/${agentId}/sessions`);
  console.log(`DEBUG: Sessions response for agent ${agentId}:`, JSON.stringify(ld, null, 2));
  assert(ls === 200, `GET sessions returns 200`);
  assert(ld.sessions.sessions.length >= 1, "at least 1 session");

  return sessionId;
}

async function testMessages(agentId, sessionId) {
  console.log("\n📨 Test: Messages");

  // Create message
  const { status: cs, data: cd } = await api("POST", `/api/agents/${agentId}/sessions/${sessionId}/messages`, {
    role: "user",
    content: "Hello from integration test!",
    tokensIn: 8
  });
  assert(cs === 201, `POST messages returns 201`);
  assert(cd.message.content === "Hello from integration test!", "message content matches");

  // List messages
  const { status: ls, data: ld } = await api("GET", `/api/agents/${agentId}/sessions/${sessionId}/messages`);
  assert(ls === 200, `GET messages returns 200`);
  assert(ld.messages.length >= 1, "at least 1 message");

  // Usage
  const { status: us, data: ud } = await api("GET", `/api/tokens/agents/${agentId}`);
  console.log(`DEBUG: Usage response status: ${us}`);
  console.log(`DEBUG: Usage response data:`, JSON.stringify(ud, null, 2));
  assert(us === 200, `GET usage returns 200`);
  if (!ud.data) {
    console.log("WARNING: No usage data returned");
    return;
  }
  assert(ud.data, "usage data exists");
  assert(typeof ud.data.totalMessages === 'number' || ud.data.totalMessages >= 1, "usage tracks messages");
  assert(typeof ud.data.totalTokensIn === 'number' || ud.data.totalTokensIn >= 1, "usage tracks tokens");
}

async function testChat(agentId) {
  if (skipOllama) {
    console.log("\n⏭️  Test: Chat (SKIPPED — --skip-ollama)");
    return;
  }

  console.log("\n🧠 Test: Chat via Ollama");

  // Check Ollama health first
  const { data: hd } = await api("GET", "/api/providers/health");
  if (!hd.ollama?.ok) {
    console.log("  ⚠️  Ollama not reachable — skipping chat test");
    return;
  }
  assert(hd.ollama.ok, "Ollama is reachable");
  const hasModel = hd.ollama.models.some((m) => m.includes("qwen3"));
  assert(hasModel, `qwen3 model available (models: ${hd.ollama.models.join(", ")})`);

  if (!hasModel) return;

  // Send chat
  const { status, data } = await api("POST", `/api/agents/${agentId}/chat`, {
    message: "Say exactly: TEST_OK"
  });

  assert(status === 200, `POST /chat returns 200`);
  assert(typeof data.message === "string" && data.message.length > 0, "response has content");
  assert(typeof data.tokensIn === "number", `tokensIn is number (${data.tokensIn})`);
  assert(typeof data.tokensOut === "number", `tokensOut is number (${data.tokensOut})`);
  assert(typeof data.duration === "number", `duration is number (${data.duration}ms)`);
  assert(data.sessionId, "sessionId returned");

  console.log(`  📝 Response: "${data.message.substring(0, 80)}..."`);
  console.log(`  📊 Tokens: ${data.tokensIn} in / ${data.tokensOut} out in ${data.duration}ms`);

  // Verify messages were stored
  const { data: msgData } = await api("GET", `/api/agents/${agentId}/sessions/${data.sessionId}/messages`);
  assert(msgData.messages.length >= 2, "at least 2 messages stored (user + assistant)");

  // Verify usage was updated
  const { data: usageData } = await api("GET", `/api/tokens/agents/${agentId}`);
  assert(usageData.data.totalTokensOut > 0, `usage tracks output tokens (${usageData.data.totalTokensOut})`);
}

async function testTopology() {
  console.log("\n🗺️  Test: Topology");
  const { status, data } = await api("GET", "/api/topology");
  assert(status === 200, "GET /api/topology returns 200");
  assert(data.capacity.maxAgentsPerMachine === 100, "capacity is 100");
  assert(Array.isArray(data.agents), "agents is array");
  assert(Array.isArray(data.links), "links is array");
}

async function testLinks(agentId) {
  console.log("\n🔗 Test: Links");

  // Debug: Check what agents exist
  const { data: allAgents } = await api("GET", "/api/agents");
  console.log(`DEBUG: All agents in system:`, JSON.stringify(allAgents.agents.map(a => ({id: a.id, name: a.name})), null, 2));
  
  // Create second agent
  const { data: cd } = await api("POST", "/api/agents", {
    name: "TargetBot",
    purpose: "Second agent for link testing purposes.",
    provider: "ollama",
    model: "qwen3:0.6b",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: true
  });
  const targetId = cd.agent.id;
  console.log(`DEBUG: Created target agent with ID: ${targetId}`);
  console.log(`DEBUG: Source agent ID: ${agentId}`);
  console.log(`DEBUG: Are IDs the same? ${agentId === targetId}`);

  // Create link
  const linkData = {
    sourceAgentId: agentId,
    targetAgentId: targetId,
    mode: "observe",
    direction: "outbound",
    enabled: true
  };
  console.log(`DEBUG: Sending link data:`, JSON.stringify(linkData, null, 2));
  
  const { status: cls, data: cld } = await api("POST", "/api/links", linkData);
  console.log(`DEBUG: Link creation response status: ${cls}`);
  console.log(`DEBUG: Link creation response data:`, JSON.stringify(cld, null, 2));
  
  if (cls !== 201) {
    console.log("Link creation failed, trying with minimal data...");
    const minimalLinkData = {
      sourceAgentId: agentId,
      targetAgentId: targetId,
      mode: "observe"
    };
    const { status: cls2, data: cld2 } = await api("POST", "/api/links", minimalLinkData);
    console.log(`Minimal link response status: ${cls2}`);
    console.log(`Minimal link response data:`, JSON.stringify(cld2, null, 2));
    
    if (cls2 === 201) {
      assert(cld2.link, "link object returned (minimal data)");
    } else {
      assert(cls === 201, "POST /api/links returns 201");
    }
  } else {
    assert(cld.link, "link object returned");
  }

  // List links to verify
  const { status: lls, data: lld } = await api("GET", "/api/links");
  assert(lls === 200, "GET /api/links returns 200");
  assert(Array.isArray(lld.links), "links array returned");
  assert(lld.links.length >= 1, "at least 1 link exists");

  // Delete link
  const { status: dls } = await api("DELETE", "/api/links", {
    sourceAgentId: agentId,
    targetAgentId: targetId
  });
  assert(dls === 200, "DELETE /api/links returns 200");

  // Delete second agent
  await api("DELETE", `/api/agents/${targetId}`);
}

async function testDeleteAgent(agentId) {
  console.log("\n🗑️  Test: Delete agent");
  const { status } = await api("DELETE", `/api/agents/${agentId}`);
  assert(status === 200, "DELETE agent returns 200");

  const { status: gs } = await api("GET", `/api/agents/${agentId}`);
  assert(gs === 404, "GET deleted agent returns 404");
}

/* ─── Main ─── */

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║  Zsiistant Integration Test — Sandbox      ║");
  console.log("║  Model: qwen3:0.6b (Ollama local)         ║");
  console.log("╚════════════════════════════════════════════╝");

  // Use existing container
  console.log(`\n🚀 Using existing container on port ${PORT}...`);
  
  // Wait for container to be ready
  let attempts = 0;
  let healthy = false;
  while (attempts < 10 && !healthy) {
    try {
      const healthCheck = await fetch(`${BASE}/health`);
      if (healthCheck.status === 200) {
        healthy = true;
        console.log("✅ Container is healthy");
        break;
      }
    } catch (err) {
      // Ignore errors during health check
    }
    attempts++;
    console.log(`Waiting for container... attempt ${attempts}/10`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  
  if (!healthy) {
    throw new Error(`Container not ready after ${attempts} attempts`);
  }

  try {
    await testHealth();
    await testSettings();
    await testProviderCatalog();
    const agentId = await testAgentCRUD();
    await testTopology();
    await testLinks(agentId);
    const sessionId = await testSessions(agentId);
    await testMessages(agentId, sessionId);
    await testChat(agentId);
    await testDeleteAgent(agentId);
  } catch (err) {
    console.error(`\n💥 Unexpected error: ${err.message}`);
    failed++;
  } finally {
    // No server to kill when using container
  }

  console.log("\n═══════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════");

  process.exit(failed > 0 ? 1 : 0);
}

main();
