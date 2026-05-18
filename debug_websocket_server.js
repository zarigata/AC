#!/usr/bin/env node

/**
 * Debug WebSocket server state
 */

import { serverState } from './apps/api/src/config/serverConfig.js';

console.log('🔍 Debugging WebSocket server state...');

console.log('Server state:', serverState);

console.log('Server state:', {
  websocketServer: serverState.websocketServer ? 'exists' : 'null',
  server: serverState.server ? 'exists' : 'null',
  totalActiveConnections: serverState.totalActiveConnections
});

if (serverState.websocketServer) {
  console.log('WebSocket server details:', {
    server: serverState.websocketServer,
    readyState: serverState.websocketServer.readyState
  });
  
  // Check if the WebSocket server has the handleUpgrade method
  if (typeof serverState.websocketServer.handleUpgrade === 'function') {
    console.log('✅ WebSocket server has handleUpgrade method');
  } else {
    console.log('❌ WebSocket server missing handleUpgrade method');
  }
} else {
  console.log('❌ WebSocket server not found in server state');
}

// Check environment variables
console.log('Environment variables:', {
  WEBSOCKET_API_KEY: process.env.WEBSOCKET_API_KEY || 'not set',
  PORT: process.env.PORT || '4000',
  NODE_ENV: process.env.NODE_ENV || 'not set'
});