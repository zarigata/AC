#!/usr/bin/env node

/**
 * Debug server state and WebSocket initialization
 */

import WebSocket from 'isomorphic-ws';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { serverState } from './apps/api/src/config/serverConfig.js';

console.log('🔍 Debugging server state...');

console.log('Current serverState:', {
  hasWebSocketServer: !!serverState.websocketServer,
  websocketServer: serverState.websocketServer,
  server: serverState.server
});

// Check if we can create a WebSocket server manually
try {
  const testWss = new WebSocketServer({ noServer: true });
  console.log('✅ WebSocket server can be created manually');
  testWss.close();
} catch (error) {
  console.log('❌ Error creating WebSocket server manually:', error.message);
}

// Let's test the actual server endpoint
const testWs = new WebSocket('ws://localhost:4000/ws');

testWs.on('open', () => {
  console.log('✅ WebSocket connection opened!');
  testWs.close();
});

testWs.on('error', (error) => {
  console.log('❌ WebSocket error:', error.message);
  console.log('Error details:', {
    code: error.code,
    message: error.message,
    stack: error.stack
  });
});

testWs.on('close', (code, reason) => {
  console.log('🔒 WebSocket closed:', code, reason.toString());
});

// Wait a bit then close
setTimeout(() => {
  if (testWs.readyState === testWs.OPEN) {
    testWs.close();
  }
  process.exit(0);
}, 5000);