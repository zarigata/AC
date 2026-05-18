#!/usr/bin/env node

/**
 * Test direct WebSocket connection to /ws endpoint
 */

import WebSocket from 'isomorphic-ws';

console.log('🔍 Testing direct WebSocket connection to /ws...');

const ws = new WebSocket('ws://localhost:4000/ws');

ws.on('open', () => {
  console.log('✅ WebSocket connection opened successfully!');
  
  // Send a test message
  const testMessage = {
    type: 'ping',
    timestamp: Date.now(),
    data: 'Hello from test client'
  };
  
  console.log('📤 Sending test message:', testMessage);
  ws.send(JSON.stringify(testMessage));
  
  // Wait a bit then close
  setTimeout(() => {
    console.log('🔒 Closing WebSocket connection...');
    ws.close();
  }, 3000);
});

ws.on('message', (message) => {
  console.log('📥 Received message:', message.toString());
});

ws.on('error', (error) => {
  console.log('❌ WebSocket error:', error.message);
  console.log('Error code:', error.code);
  console.log('Error stack:', error.stack);
});

ws.on('close', (code, reason) => {
  console.log('🔒 WebSocket connection closed:', code, reason.toString());
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  if (ws.readyState !== WebSocket.CLOSED) {
    console.log('⏰ Timeout - terminating connection');
    ws.terminate();
    process.exit(1);
  }
}, 10000);