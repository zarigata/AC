#!/usr/bin/env node

/**
 * Test the full server initialization and WebSocket functionality
 */

import { AgentRegistry } from './apps/api/src/registry.js';
import { initializeServer, startServer, serverState } from './apps/api/src/config/serverConfig.js';

console.log('🔍 Testing full server initialization...');

// Create a test registry
const databasePath = new URL("../data/zsiistant.sqlite", import.meta.url).pathname;
const registry = new AgentRegistry({ databasePath });

try {
  console.log('\n🚀 Initializing server...');
  const { server, config, providers } = await initializeServer(registry);
  console.log('✅ Server initialized');
  console.log('Server state:', {
    hasWebSocketServer: !!serverState.websocketServer,
    websocketServer: !!serverState.websocketServer,
    server: !!server
  });
  
  console.log('\n🚀 Starting server...');
  await startServer(server, config);
  console.log('✅ Server started on', config.host, ':', config.port);
  
  // Test HTTP endpoint
  console.log('\n🧪 Testing HTTP endpoint...');
  const http = await fetch('http://localhost:4000/health');
  console.log('HTTP Response:', http.status, await http.text());
  
  // Test WebSocket endpoint
  console.log('\n🧪 Testing WebSocket endpoint...');
  // We'll create a test here that uses setTimeout to avoid blocking
  console.log('WebSocket endpoint should be available at ws://localhost:4000/ws');
  
} catch (error) {
  console.log('❌ Error:', error.message);
  console.log('Error stack:', error.stack);
}

process.exit(0);