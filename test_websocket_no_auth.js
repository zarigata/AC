#!/usr/bin/env node

/**
 * Test WebSocket connection without authentication
 */

import WebSocket from 'isomorphic-ws';

const SERVER_URL = 'ws://localhost:4000/ws';

console.log('🧪 Testing WebSocket connection without auth...');

// Create a WebSocket connection without auth
const ws = new WebSocket(SERVER_URL);

ws.on('open', () => {
  console.log('✅ WebSocket connection opened (without auth)');
  
  // Send a ping message
  ws.send(JSON.stringify({ type: 'ping' }));
  
  // Close connection after a short delay
  setTimeout(() => {
    ws.close();
    console.log('🔌 WebSocket connection closed');
  }, 2000);
});

ws.on('message', (message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log('📨 Received message:', data);
  } catch (error) {
    console.log('⚠️ Non-JSON message received:', message.toString());
  }
});

ws.on('error', (error) => {
  console.log('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('🔌 WebSocket connection closed');
});

// Set a timeout in case connection fails
setTimeout(() => {
  if (ws.readyState !== WebSocket.OPEN) {
    console.log('❌ WebSocket connection failed or timed out');
    process.exit(1);
  }
}, 5000);