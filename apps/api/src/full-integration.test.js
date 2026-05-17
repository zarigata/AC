import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { URL } from "node:url";
import WebSocket from "ws";

// Test configuration
const BASE_URL = "http://localhost:4000";
const WS_URL = "ws://localhost:4000";
const TEST_API_KEY = "zsiistant-test-api-key-12345";
const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMjlkZWY1ZS03MTA0LTQ5ZGEtODZiMC1lMjZkMWE0NmE2MGEiLCJ1c2VybmFtZSI6ImludGVncmF0aW9udGVzdCIsInJvbGUiOiJ1c2VyIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc3OTAxNzY5NywiZXhwIjoxNzc5MDIxMjk3fQ.cFb7Yxj8L8bxQSQKKFQEgrU3ViIA0BASvFVaKrIYRtA";

// Simple HTTP client for testing
async function fetchWithAuth(path, options = {}) {
  const url = new URL(path, BASE_URL);
  const defaultHeaders = {
    "User-Agent": "Zsiistant-Test/1.0"
  };
  
  // Add JWT token for authenticated requests
  if (JWT_TOKEN && !options.headers?.Authorization && !path.includes('/health')) {
    defaultHeaders["Authorization"] = `Bearer ${JWT_TOKEN}`;
  }
  
  if (options.body && typeof options.body === "object") {
    defaultHeaders["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  
  const finalOptions = {
    method: "GET",
    headers: { ...defaultHeaders, ...(options.headers || {}) },
    ...options
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(url, finalOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: () => Promise.resolve(data),
          json: () => Promise.resolve(JSON.parse(data))
        });
      });
    });
    
    req.on("error", reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// Mock fetch function for compatibility
global.fetch = fetchWithAuth;

test.describe("Full Integration Test Suite", () => {
  let testAgentId = null;
  let testSessionId = null;

  test.before(async () => {
    // Verify server is running
    try {
      const response = await fetchWithAuth(`/health`);
      assert.equal(response.status, 200);
      const health = await response.json();
      assert.ok(health.ok === true);
      console.log("✅ Server is healthy");
    } catch (error) {
      throw new Error(`Server health check failed: ${error.message}`);
    }
  });

  test.describe("Health Endpoints", () => {
    test("GET /health should return 200", async () => {
      const response = await fetchWithAuth(`/health`);
      assert.equal(response.status, 200);
      
      const data = await response.json();
      assert.ok(data.ok === true);
      assert.ok(data.uptime);
      assert.ok(data.service);
    });

    test("GET /health/extended should return detailed status", async () => {
      const response = await fetchWithAuth(`/health/extended`);
      assert.equal(response.status, 200);
      
      const data = await response.json();
      assert.ok(data.status);
      assert.ok(data.uptime);
      assert.ok(data.registry);
      assert.ok(data.providers);
    });
  });

  test.describe("Authentication", () => {
    test("Protected routes require API key", async () => {
      // Test without API key
      const response = await fetchWithAuth(`/api/agents`, { headers: {} });
      assert.equal(response.status, 401);
      
      // Test with invalid API key
      const invalidKeyResponse = await fetchWithAuth(`/api/agents`, {
        headers: { "Authorization": "Bearer invalid-key" }
      });
      assert.equal(invalidKeyResponse.status, 401);
    });

    test("Valid API key access", async () => {
      const response = await fetchWithAuth(`/api/agents`);
      assert.equal(response.status, 200);
    });
  });

  test.describe("Agent Management", () => {
    test("POST /api/agents should create a new agent", async () => {
      const agentData = {
        name: "Test Integration Agent",
        purpose: "For testing integration workflows",
        provider: "ollama",
        model: "qwen3:1.7b",
        isolationMode: "isolated",
        maxConcurrentTasks: 2,
        peerAccess: false
      };

      const response = await fetchWithAuth(`/api/agents`, {
        method: "POST",
        body: agentData
      });

      assert.equal(response.status, 201);
      const data = await response.json();
      testAgentId = data.id;
      assert.ok(data.id);
      assert.equal(data.name, agentData.name);
      assert.equal(data.provider, agentData.provider);
    });

    test("GET /api/agents should list agents", async () => {
      const response = await fetchWithAuth(`/api/agents`);

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 0);
      
      // Find our test agent
      const testAgent = data.find(agent => agent.id === testAgentId);
      assert.ok(testAgent);
      assert.equal(testAgent.name, "Test Integration Agent");
    });

    test("GET /api/agents/:id should return specific agent", async () => {
      const response = await fetchWithAuth(`/api/agents/${testAgentId}`);

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.id, testAgentId);
      assert.equal(data.name, "Test Integration Agent");
    });

    test("PATCH /api/agents/:id should update agent", async () => {
      const updateData = {
        name: "Updated Test Agent",
        maxConcurrentTasks: 5
      };

      const response = await fetchWithAuth(`/api/agents/${testAgentId}`, {
        method: "PATCH",
        body: updateData
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.name, "Updated Test Agent");
      assert.equal(data.maxConcurrentTasks, 5);
    });

    test("DELETE /api/agents/:id should remove agent", async () => {
      const response = await fetchWithAuth(`/api/agents/${testAgentId}`, {
        method: "DELETE"
      });

      assert.equal(response.status, 200);
      
      // Verify agent is deleted
      const getResponse = await fetch(`${BASE_URL}/api/agents/${testAgentId}`, {
        headers: { "Authorization": `Bearer ${TEST_API_KEY}` }
      });
      assert.equal(getResponse.status, 404);
    });
  });

  test.describe("Chat & Sessions", () => {
    test("POST /api/sessions should create a session", async () => {
      const sessionData = {
        name: "Test Integration Session",
        agentId: (await getFirstAgentId()).id
      };

      const response = await fetch(`${BASE_URL}/api/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TEST_API_KEY}`
        },
        body: JSON.stringify(sessionData)
      });

      assert.equal(response.status, 201);
      const data = await response.json();
      testSessionId = data.id;
      assert.ok(data.id);
      assert.equal(data.name, sessionData.name);
    });

    test("POST /api/chat should stream chat response", async () => {
      const chatData = {
        sessionId: testSessionId,
        message: "Hello, this is a test message",
        stream: true
      };

      const response = await fetchWithAuth(`/api/chat`, {
        method: "POST",
        body: chatData
      });

      assert.equal(response.status, 200);
      const text = await response.text();
      
      // Should be streaming JSON
      assert.ok(text.length > 0);
      assert.ok(text.includes("data:"));
    });

    test("GET /api/sessions should list sessions", async () => {
      const response = await fetchWithAuth(`/api/sessions`);

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 0);
      
      // Find our test session
      const testSession = data.find(session => session.id === testSessionId);
      assert.ok(testSession);
    });
  });

  test.describe("Providers & Settings", () => {
    test("GET /api/providers should list available providers", async () => {
      const response = await fetch(`${BASE_URL}/api/providers`, {
        headers: { "Authorization": `Bearer ${TEST_API_KEY}` }
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 0);
      
      // Should include ollama
      const ollamaProvider = data.find(p => p.id === "ollama");
      assert.ok(ollamaProvider);
    });

    test("GET /api/settings should return current settings", async () => {
      const response = await fetchWithAuth(`/api/settings`);

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(data.server);
      assert.ok(data.registry);
    });

    test("PATCH /api/settings should update settings", async () => {
      const updateData = {
        registry: {
          maxAgents: 50
        }
      };

      const response = await fetchWithAuth(`/api/settings`, {
        method: "PATCH",
        body: updateData
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.registry.maxAgents, 50);
    });
  });

  test.describe("Tools & Jobs", () => {
    test("GET /api/tools should list available tools", async () => {
      const response = await fetchWithAuth(`/api/tools`);

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 0);
    });

    test("POST /api/jobs should create a job", async () => {
      const jobData = {
        type: "test-job",
        config: {
          testParam: "test-value"
        }
      };

      const response = await fetchWithAuth(`/api/jobs`, {
        method: "POST",
        body: jobData
      });

      assert.equal(response.status, 201);
      const data = await response.json();
      assert.ok(data.id);
      assert.equal(data.type, jobData.type);
    });
  });

  test.describe("Web UI", () => {
    test("GET / should serve web UI", async () => {
      const response = await fetchWithAuth(`/`);
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(text.length > 0);
      assert.ok(text.includes("html") || text.includes("<!DOCTYPE>"));
    });

    test("GET /api/webui/config should return UI config", async () => {
      const response = await fetchWithAuth(`/api/webui/config`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(data.version);
      assert.ok(config.features);
    });
  });

  test.describe("Error Handling", () => {
    test("404 for non-existent routes", async () => {
      const response = await fetchWithAuth(`/api/non-existent-endpoint`);
      assert.equal(response.status, 404);
    });

    test("400 for invalid JSON", async () => {
      const response = await fetchWithAuth(`/api/agents`, {
        method: "POST",
        body: "invalid json"
      });
      assert.equal(response.status, 400);
    });
  });

  test.after(async () => {
    // Cleanup test data
    if (testSessionId) {
      await fetch(`${BASE_URL}/api/sessions/${testSessionId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${TEST_API_KEY}` }
      }).catch(() => {}); // Ignore cleanup errors
    }
    
    if (testAgentId) {
      await fetch(`${BASE_URL}/api/agents/${testAgentId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${TEST_API_KEY}` }
      }).catch(() => {}); // Ignore cleanup errors
    }
  });
});

// Helper function to get first agent ID
async function getFirstAgentId() {
  const response = await fetchWithAuth(`/api/agents`);
  const data = await response.json();
  return data[0];
}