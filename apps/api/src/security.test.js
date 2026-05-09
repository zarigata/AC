import assert from "node:assert/strict";
import test from "node:test";
import { AgentRegistry } from "./registry.js";

const createRegistry = () => new AgentRegistry({ databasePath: ":memory:" });

test("Security: Prevents prototype pollution in agent creation", () => {
  const registry = createRegistry();
  
  // Test that legitimate agent creation works
  const validAgent = {
    name: "TestBot",
    purpose: "Testing security features",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 2,
    peerAccess: false
  };
  
  // This should work fine
  const agent = registry.createAgent(validAgent);
  assert.ok(agent);
  
  // Test that prototype pollution is blocked
  const maliciousAgent = {
    ...validAgent,
    __proto__: { polluted: true }, // This should be rejected
    constructor: { malicious: true }, // This should be rejected
    prototype: { hacked: true } // This should be rejected
  };
  
  assert.throws(() => {
    registry.createAgent(maliciousAgent);
  }, /contains potentially dangerous property/);
});

test("Security: Prevents SQL injection in agent names and purposes", () => {
  const registry = createRegistry();
  
  const sqlInjectionAttempts = [
    {
      name: "Robert'); DROP TABLE agents; --",
      purpose: "Normal purpose",
      shouldFail: true
    },
    {
      name: "Normal name",
      purpose: "'); DROP TABLE sessions; --",
      shouldFail: true
    },
    {
      name: "<script>alert('xss')</script>",
      purpose: "Normal purpose",
      shouldFail: true
    },
    {
      name: "Normal name",
      purpose: "javascript:alert('xss')",
      shouldFail: true
    }
  ];
  
  for (const attempt of sqlInjectionAttempts) {
    if (attempt.shouldFail) {
      assert.throws(() => {
        registry.createAgent({
          name: attempt.name,
          purpose: attempt.purpose,
          provider: "openai",
          model: "gpt-5.4-mini",
          isolationMode: "isolated",
          maxConcurrentTasks: 1,
          peerAccess: false
        });
      }, /contains invalid or potentially dangerous content/);
    }
  }
});

test("Security: Validates input bounds and types", () => {
  const registry = createRegistry();
  
  // Test extreme values that should be rejected
  const extremeAgents = [
    {
      name: "A".repeat(1000), // Too long
      purpose: "Normal purpose",
      provider: "openai",
      model: "gpt-5.4-mini",
      isolationMode: "isolated",
      maxConcurrentTasks: 1000, // Too high
      peerAccess: false
    },
    {
      name: "Normal name",
      purpose: "A".repeat(500), // Too long
      provider: "openai",
      model: "gpt-5.4-mini",
      isolationMode: "isolated",
      maxConcurrentTasks: 1,
      peerAccess: false
    },
    {
      name: "", // Too short
      purpose: "Normal purpose",
      provider: "openai",
      model: "gpt-5.4-mini",
      isolationMode: "isolated",
      maxConcurrentTasks: 1,
      peerAccess: false
    }
  ];
  
  for (const agent of extremeAgents) {
    assert.throws(() => {
      registry.createAgent(agent);
    }, /must be between|must be an integer between|Invalid/);
  }
});

test("Security: Prevents circular reference attacks", () => {
  const registry = createRegistry();
  
  // Create a circular reference
  const circularAgent = {
    name: "Circular test",
    purpose: "Testing circular references",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  };
  
  // This should work
  const agent = registry.createAgent(circularAgent);
  assert.ok(agent);
  
  // Test with deeply nested object (should pass as long as not too deep)
  const nestedAgent = {
    ...circularAgent,
    config: {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: {
                  level7: {
                    level8: {
                      level9: {
                        level10: {
                          level11: "This should fail - too deep"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
  
  assert.throws(() => {
    registry.createAgent(nestedAgent);
  }, /is too deeply nested/);
});

test("Security: Validates message content safety", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "TestBot",
    purpose: "Testing security features",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });
  
  const session = registry.createSession(agent.id);
  
  // Test that legitimate messages work
  const validMessage = {
    role: "user",
    content: "Hello, how are you?",
    tokensIn: 5,
    tokensOut: 0
  };
  
  const message = registry.createMessage(agent.id, session.id, validMessage);
  assert.ok(message);
  
  // Test dangerous content that should be rejected
  const dangerousMessages = [
    {
      role: "user",
      content: "<script>alert('xss')</script>",
      tokensIn: 5,
      tokensOut: 0
    },
    {
      role: "user", 
      content: "javascript:alert('xss')",
      tokensIn: 5,
      tokensOut: 0
    },
    {
      role: "user",
      content: "<iframe src='malicious.com'></iframe>",
      tokensIn: 5,
      tokensOut: 0
    },
    {
      role: "user",
      content: eval("dangerous"), // This should be caught
      tokensIn: 5,
      tokensOut: 0
    }
  ];
  
  for (const msg of dangerousMessages) {
    assert.throws(() => {
      registry.createMessage(agent.id, session.id, msg);
    }, /contains potentially dangerous content|invalid or potentially dangerous content/);
  }
});

test("Security: Validates session data integrity", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "TestBot",
    purpose: "Testing security features",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });
  
  // Test legitimate session creation
  const validSession = registry.createSession(agent.id, { 
    title: "Test Session", 
    model: "gpt-4" 
  });
  assert.ok(validSession);
  
  // Test with dangerous title
  assert.throws(() => {
    registry.createSession(agent.id, { 
      title: "<script>alert('xss')</script>", 
      model: "gpt-4" 
    });
  }, /contains invalid or potentially dangerous content/);
  
  // Test with unknown agent (should return null)
  const unknownAgentSession = registry.createSession("00000000-0000-0000-0000-000000000000");
  assert.equal(unknownAgentSession, null);
});

test("Security: Handles unknown sessions gracefully", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "TestBot",
    purpose: "Testing security features",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });
  
  // Test creating message with unknown session (should return null)
  const result = registry.createMessage(
    agent.id, 
    "00000000-0000-0000-0000-000000000000", 
    { role: "user", content: "test", tokensIn: 1, tokensOut: 0 }
  );
  assert.equal(result, null);
});

test("Security: Validates link creation integrity", () => {
  const registry = createRegistry();
  const agentA = registry.createAgent({
    name: "AgentA",
    purpose: "First agent",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });
  
  const agentB = registry.createAgent({
    name: "AgentB", 
    purpose: "Second agent",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });
  
  // Test legitimate link creation
  const link = registry.createLink({
    sourceAgentId: agentA.id,
    targetAgentId: agentB.id,
    mode: "message"
  });
  assert.ok(link);
  
  // Test self-link (should throw error)
  assert.throws(() => {
    registry.createLink({
      sourceAgentId: agentA.id,
      targetAgentId: agentA.id,
      mode: "message"
    });
  }, /cannot create a link to itself/);
  
  // Test link with unknown agent (should return false)
  const result = registry.deleteLink({
    sourceAgentId: agentA.id,
    targetAgentId: "00000000-0000-0000-0000-000000000000"
  });
  assert.equal(result, false);
});

test("Security: Validates update operations", () => {
  const registry = createRegistry();
  const agent = registry.createAgent({
    name: "TestBot",
    purpose: "Testing security features",
    provider: "openai",
    model: "gpt-5.4-mini",
    isolationMode: "isolated",
    maxConcurrentTasks: 1,
    peerAccess: false
  });
  
  // Test legitimate update
  const updated = registry.updateAgent(agent.id, { 
    name: "UpdatedBot",
    status: "running" 
  });
  assert.equal(updated.name, "UpdatedBot");
  assert.equal(updated.status, "running");
  
  // Test update with dangerous content
  assert.throws(() => {
    registry.updateAgent(agent.id, { 
      name: "<script>alert('xss')</script>" 
    });
  }, /contains invalid or potentially dangerous content/);
  
  // Test update with unknown agent (should return null)
  const result = registry.updateAgent("00000000-0000-0000-0000-000000000000", { 
    name: "Test" 
  });
  assert.equal(result, null);
});