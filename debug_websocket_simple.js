#!/usr/bin/env node

/**
 * Simple WebSocket debug script
 */

import WebSocket from 'isomorphic-ws';

const SERVER_URL = 'ws://localhost:4000/ws';

console.log('🔍 Starting simple WebSocket debug...');

// Create a WebSocket connection without authentication first
const ws = new WebSocket(SERVER_URL);

ws.on('open', () => {
  console.log('✅ WebSocket connection opened!');
  ws.close();
});

ws.on('error', (error) => {
  console.log('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log('🔒 WebSocket closed:', code, reason.toString());
});

// Wait a bit then close
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
}, 5000);