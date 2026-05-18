#!/usr/bin/env node

/**
 * Comprehensive WebSocket Test for V16 - Real-time chat interface
 * Tests authentication, session management, and bidirectional messaging
 */

import WebSocket from 'isomorphic-ws';

const SERVER_URL = 'ws://localhost:4000/ws';
const WEBSOCKET_API_KEY = process.env.WEBSOCKET_API_KEY || 'test-key-for-development';
const REST_API_KEY = 'zsiistant-test-api-key-12345';

console.log('🧪 Starting WebSocket V16 Test Suite...');

// Track test results
const testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// Helper function to run a test
async function runTest(testName, testFn) {
  testResults.total++;
  console.log(`\n🔍 Running test: ${testName}`);
  
  try {
    await testFn();
    testResults.passed++;
    console.log(`✅ PASSED: ${testName}`);
    return true;
  } catch (error) {
    testResults.failed++;
    console.log(`❌ FAILED: ${testName}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

// Helper function to create a WebSocket connection with authentication
async function createAuthenticatedConnection() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${SERVER_URL}?auth=${encodeURIComponent(WEBSOCKET_API_KEY)}`);
    
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('Connection timeout'));
    }, 5000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('✅ WebSocket connection established');
      resolve(ws);
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${error.message}`));
    });
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'connected') {
          console.log('✅ Authentication successful');
        }
      } catch (e) {
        // Ignore non-JSON messages during connection
      }
    });
  });
}

// Test 1: Basic Connection and Authentication
async function testBasicConnection() {
  const ws = await createAuthenticatedConnection();
  
  // Send ping
  await new Promise((resolve) => {
    ws.send(JSON.stringify({ type: 'ping' }));
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'pong') {
          resolve();
        }
      } catch (e) {
        reject(new Error('Invalid ping response'));
      }
    });
  });
  
  ws.close();
}

// Test 2: Session Management
async function testSessionManagement() {
  const ws = await createAuthenticatedConnection();
  
  // Subscribe to a session
  const sessionId = `test-session-${Date.now()}`;
  ws.send(JSON.stringify({
    type: 'subscribe',
    data: { sessionId }
  }));
  
  // Wait for subscription confirmation
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Subscription confirmation timeout'));
    }, 3000);
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'subscribed' && data.sessionId === sessionId) {
          clearTimeout(timeout);
          resolve();
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    });
  });
  
  // Unsubscribe from the session
  ws.send(JSON.stringify({
    type: 'unsubscribe',
    data: { sessionId }
  }));
  
  // Wait for unsubscription confirmation
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Unsubscription confirmation timeout'));
    }, 3000);
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'unsubscribed') {
          clearTimeout(timeout);
          resolve();
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    });
  });
  
  ws.close();
}

// Test 3: Chat Message Flow
async function testChatMessageFlow() {
  const ws = await createAuthenticatedConnection();
  
  // Create or get an agent first via REST API
  const agentResponse = await fetch('http://localhost:4000/api/agents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': REST_API_KEY
    },
    body: JSON.stringify({
      name: 'Test Agent for WebSocket',
      model: 'qwen3:1.7b',
      purpose: 'testing agent for websocket chat functionality',
      provider: 'ollama'
    })
  });
  
  if (!agentResponse.ok) {
    throw new Error(`Failed to create agent: ${agentResponse.status}`);
  }
  
  const agentData = await agentResponse.json();
  const agentId = agentData.id;
  
  // Create a session
  const sessionResponse = await fetch(`http://localhost:4000/api/agents/${agentId}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': REST_API_KEY
    },
    body: JSON.stringify({
      title: 'WebSocket Test Session'
    })
  });
  
  if (!sessionResponse.ok) {
    throw new Error(`Failed to create session: ${sessionResponse.status}`);
  }
  
  const sessionData = await sessionResponse.json();
  const sessionId = sessionData.id;
  
  console.log(`📝 Created agent ${agentId} and session ${sessionId}`);
  
  // Subscribe to the session
  ws.send(JSON.stringify({
    type: 'subscribe',
    data: { sessionId }
  }));
  
  // Wait for subscription
  await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(), 2000);
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'subscribed' && data.sessionId === sessionId) {
          clearTimeout(timeout);
          resolve();
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    });
  });
  
  // Send a chat message
  const testMessage = 'Hello! This is a WebSocket test message.';
  ws.send(JSON.stringify({
    type: 'chat',
    data: {
      message: testMessage,
      agentId: agentId,
      sessionId: sessionId
    }
  }));
  
  // Wait for response
  let responseReceived = false;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        reject(new Error('Chat response timeout'));
      }
    }, 15000);
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`📨 Received message:`, data);
        
        if (data.type === 'chat_response' || data.type === 'session_message') {
          responseReceived = true;
          clearTimeout(timeout);
          
          // Validate response
          if (!data.message || typeof data.message !== 'string') {
            reject(new Error('Invalid chat response format'));
          } else {
            resolve();
          }
        }
      } catch (e) {
        console.log('⚠️ Non-JSON message received');
      }
    });
  });
  
  ws.close();
}

// Test 4: Error Handling
async function testErrorHandling() {
  // Test invalid authentication
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${SERVER_URL}?auth=invalid-key`);
    
    const timeout = setTimeout(() => {
      ws.terminate();
      resolve(); // Error handling test passed - connection should be rejected
    }, 3000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      reject(new Error('Connection should have been rejected with invalid key'));
    });
    
    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(); // Expected error
    });
  });
}

// Test 5: WebSocket Status Endpoint
async function testWebSocketStatusEndpoint() {
  const response = await fetch('http://localhost:4000/api/ws/status', {
    headers: {
      'X-API-Key': REST_API_KEY
    }
  });
  
  if (!response.ok) {
    throw new Error(`Status endpoint returned ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.websocket || typeof data.websocket.connected !== 'number') {
    throw new Error('Invalid status response format');
  }
  
  console.log(`📊 WebSocket status: ${data.websocket.connected} connected clients`);
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting WebSocket V16 Tests...\n');
  
  // Run all tests
  await runTest('Basic Connection and Authentication', testBasicConnection);
  await runTest('Session Management', testSessionManagement);
  await runTest('Chat Message Flow', testChatMessageFlow);
  await runTest('Error Handling', testErrorHandling);
  await runTest('WebSocket Status Endpoint', testWebSocketStatusEndpoint);
  
  // Print summary
  console.log('\n📊 Test Results Summary:');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📝 Total: ${testResults.total}`);
  
  if (testResults.failed === 0) {
    console.log('\n🎉 All WebSocket V16 tests passed!');
    process.exit(0);
  } else {
    console.log('\n💥 Some tests failed. WebSocket V16 needs work.');
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the tests
runAllTests().catch(console.error);