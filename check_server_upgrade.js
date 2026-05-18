#!/usr/bin/env node

/**
 * Check if WebSocket upgrade handler is properly set up
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { serverState } from './apps/api/src/config/serverConfig.js';
import { handleWebSocketUpgrade } from './apps/api/src/middleware/webSocketHandler.js';

console.log('🔍 Checking server upgrade handler setup...');

// Check if we can access the server directly through process
console.log('Process info:', {
  pid: process.pid,
  ppid: process.ppid,
  cwd: process.cwd()
});

// Try to find the server through process listeners or other methods
console.log('Current server listeners:', {
  upgrade: process.listeners('upgrade').length,
  request: process.listeners('request').length
});

// Check if there are any upgrade handlers registered
const upgradeListeners = process.listeners('upgrade');
console.log('Upgrade listeners found:', upgradeListeners.length);

if (upgradeListeners.length > 0) {
  console.log('✅ Found', upgradeListeners.length, 'upgrade listener(s)');
  upgradeListeners.forEach((listener, index) => {
    console.log(`Upgrade listener ${index}:`, listener.name || 'anonymous');
  });
} else {
  console.log('❌ No upgrade listeners found');
}

// Check WebSocket module availability
try {
  const WebSocket = require('ws');
  console.log('✅ WebSocket module available');
  console.log('WebSocket version:', WebSocket.version);
} catch (err) {
  console.log('❌ WebSocket module not available:', err.message);
}

// Check if we can create a WebSocket server
try {
  const testWss = new WebSocketServer({ noServer: true });
  console.log('✅ Can create WebSocket server');
  testWss.close();
} catch (err) {
  console.log('❌ Cannot create WebSocket server:', err.message);
}

console.log('🔧 Server check completed');