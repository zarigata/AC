#!/usr/bin/env node
/**
 * WebSocket Chat Interface Test - V16 Implementation
 *
 * Tests the real-time WebSocket chat functionality:
 *
 *   1. Connect to WebSocket endpoint
 *   2. Subscribe to agent session
 *   3. Send chat messages
 *   4. Verify real-time responses
 *   5. Test error handling
 *   6. Test connection management
 *
 * Usage: node tests/test-websocket-chat.js
 */

import { WebSocket } from 'ws';
import { setTimeout } from 'node:timers';

const WS_URL = 'ws://localhost:4000/ws';
const TEST_AGENT_ID = 'test-websocket-agent';

let ws = null;
let connected = false;
let responseCount = 0;
let testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

/* ─── Test Helpers ─── */

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function reportError(testName, error) {
  testResults.failed++;
  testResults.errors.push({ test: testName, error: error.message || error });
  log(`❌ ${testName}: ${error.message || error}`);
}

function reportSuccess(testName, details = '') {
  testResults.passed++;
  log(`✅ ${testName}${details ? ` - ${details}` : ''}`);
}

function waitForConnection(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!connected) {
        reject(new Error('WebSocket connection timeout'));
      }
    }, timeout);
    
    const checkInterval = setInterval(() => {
      if (connected) {
        clearInterval(checkInterval);
        clearTimeout(timer);
        resolve();
      }
    }, 100);
  });
}

function waitForResponse(type, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${type} response`));
    }, timeout);
    
    const handler = (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === type) {
          ws.removeEventListener('message', handler);
          clearTimeout(timer);
          resolve(message);
        }
      } catch (err) {
        // Ignore parse errors, wait for correct message type
      }
    };
    
    ws.addEventListener('message', handler);
  });
}

/* ─── Test Cases ─── */

async function testWebSocketConnection() {
  log('🔌 Testing WebSocket connection...');
  
  return new Promise((resolve, reject) => {
    try {
      ws = new WebSocket(WS_URL);
      
      ws.on('open', () => {
        connected = true;
        reportSuccess('WebSocket Connection');
        resolve();
      });
      
      ws.on('error', (error) => {
        reportError('WebSocket Connection', error);
        reject(error);
      });
      
      ws.on('close', () => {
        connected = false;
        log('WebSocket connection closed');
      });
      
    } catch (error) {
      reportError('WebSocket Connection', error);
      reject(error);
    }
  });
}

async function testPingPong() {
  log('🏓 Testing ping/pong functionality...');
  
  return new Promise((resolve, reject) => {
    try {
      const responseTimeout = setTimeout(() => {
        reject(new Error('Ping timeout'));
      }, 5000);
      
      const handler = (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'pong') {
            ws.removeEventListener('message', handler);
            clearTimeout(responseTimeout);
            reportSuccess('Ping/Pong');
            resolve();
          }
        } catch (err) {
          // Ignore parse errors
        }
      };
      
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      
    } catch (error) {
      reportError('Ping/Pong', error);
      reject(error);
    }
  });
}

async function testAgentSubscription() {
  log('📡 Testing agent subscription...');
  
  try {
    // First create a test agent via HTTP API
    const createAgent = await fetch('http://localhost:4000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'zsiistant-test-api-key-12345'
      },
      body: JSON.stringify({
        name: 'WebSocket Test Agent',
        model: 'qwen3:1.7b',
        provider: 'ollama',
        purpose: 'Testing WebSocket chat functionality'
      })
    });
    
    if (!createAgent.ok) {
      throw new Error(`Failed to create test agent: ${createAgent.status}`);
    }
    
    const agentData = await createAgent.json();
    const agentId = agentData.agent.id;
    
    // Subscribe to the agent via WebSocket
    ws.send(JSON.stringify({
      type: 'subscribe',
      data: { agentId }
    }));
    
    // Wait for subscription confirmation
    const response = await waitForResponse('subscribed', 5000);
    reportSuccess('Agent Subscription', `Agent ${agentId}`);
    
    // Test session listing
    ws.send(JSON.stringify({
      type: 'get_sessions',
      data: { agentId }
    }));
    
    const sessionsResponse = await waitForResponse('sessions_list', 5000);
    reportSuccess('Session Listing', `${sessionsResponse.data.sessions.length} sessions`);
    
    return agentId;
    
  } catch (error) {
    reportError('Agent Subscription', error);
    throw error;
  }
}

async function testChatMessaging(agentId) {
  log('💬 Testing chat messaging...');
  
  try {
    // Create a session first
    const createSession = await fetch(`http://localhost:4000/api/agents/${agentId}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'zsiistant-test-api-key-12345'
      },
      body: JSON.stringify({
        title: 'WebSocket Test Session',
        model: 'qwen3:1.7b'
      })
    });
    
    if (!createSession.ok) {
      throw new Error(`Failed to create test session: ${createSession.status}`);
    }
    
    const sessionData = await createSession.json();
    const sessionId = sessionData.session.id;
    
    // Subscribe to the session
    ws.send(JSON.stringify({
      type: 'subscribe',
      data: { agentId, sessionId }
    }));
    
    // Send a test message
    const testMessage = 'Hello, this is a WebSocket test message!';
    ws.send(JSON.stringify({
      type: 'chat',
      data: {
        message: testMessage,
        agentId,
        sessionId,
        type: 'chat'
      }
    }));
    
    // Wait for chat response
    const chatResponse = await waitForResponse('chat_response', 15000);
    
    if (chatResponse.data.message && chatResponse.data.message.length > 0) {
      responseCount++;
      reportSuccess('Chat Messaging', `Received response: ${chatResponse.data.message.slice(0, 50)}...`);
    } else {
      throw new Error('Empty chat response received');
    }
    
    return true;
    
  } catch (error) {
    reportError('Chat Messaging', error);
    throw error;
  }
}

async function testErrorHandling() {
  log('🚨 Testing error handling...');
  
  try {
    // Test invalid message type
    ws.send(JSON.stringify({
      type: 'invalid_type',
      data: {}
    }));
    
    // Should receive an error response
    const errorResponse = await waitForResponse('error', 5000);
    if (errorResponse.code === 'UNKNOWN_TYPE') {
      reportSuccess('Error Handling - Invalid Type');
    }
    
    // Test malformed message
    ws.send('not json');
    
    // Should not crash the connection
    setTimeout(() => {
      if (connected) {
        reportSuccess('Error Handling - Malformed JSON');
      }
    }, 2000);
    
    return true;
    
  } catch (error) {
    reportError('Error Handling', error);
    throw error;
  }
}

async function testConnectionManagement() {
  log('🔒 Testing connection management...');
  
  try {
    // Test connection status via HTTP endpoint
    const statusResponse = await fetch('http://localhost:4000/api/ws/status', {
      headers: {
        'X-API-Key': 'zsiistant-test-api-key-12345'
      }
    });
    
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      if (status.websocket && status.websocket.connected > 0) {
        reportSuccess('Connection Status', `${status.websocket.connected} active connections`);
      }
    }
    
    return true;
    
  } catch (error) {
    reportError('Connection Management', error);
    throw error;
  }
}

async function cleanup(agentId) {
  log('🧹 Cleaning up test data...');
  
  try {
    if (agentId) {
      await fetch(`http://localhost:4000/api/agents/${agentId}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': 'zsiistant-test-api-key-12345'
        }
      });
      log('Test agent deleted');
    }
    
    if (ws && connected) {
      ws.close();
      connected = false;
      log('WebSocket connection closed');
    }
    
  } catch (error) {
    log(`Cleanup error: ${error.message}`);
  }
}

/* ─── Main Test Runner ─── */

async function runTests() {
  log('🚀 Starting WebSocket Chat Interface Tests (V16)...');
  
  try {
    // Run all tests sequentially
    await testWebSocketConnection();
    await testPingPong();
    const agentId = await testAgentSubscription();
    await testChatMessaging(agentId);
    await testErrorHandling();
    await testConnectionManagement();
    
    log('\\n📊 Test Results Summary:');
    log(`✅ Passed: ${testResults.passed}`);
    log(`❌ Failed: ${testResults.failed}`);
    
    if (testResults.errors.length > 0) {
      log('\\n📝 Errors:');
      testResults.errors.forEach(err => {
        log(`  - ${err.test}: ${err.error}`);
      });
    }
    
    if (testResults.failed === 0) {
      log('\\n🎉 All WebSocket chat interface tests passed!');
      process.exit(0);
    } else {
      log(`\\n⚠️  ${testResults.failed} tests failed`);
      process.exit(1);
    }
    
  } catch (error) {
    log(`\\n💥 Test suite failed: ${error.message}`);
    testResults.errors.push({ test: 'Test Suite', error: error.message });
    process.exit(1);
  } finally {
    // Clean up any test data
    // Agent ID will be available from testAgentSubscription
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log(`💥 Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log(`💥 Unhandled rejection: ${reason}`);
  process.exit(1);
});

// Start the test suite
runTests().catch((error) => {
  log(`\\n💥 Test suite failed: ${error.message}`);
  process.exit(1);
});