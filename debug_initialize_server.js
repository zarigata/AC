#!/usr/bin/env node

/**
 * Debug initializeServer function call
 */

import { AgentRegistry } from './apps/api/src/registry.js';
import { initializeServer, serverState } from './apps/api/src/config/serverConfig.js';

console.log('🔍 Debugging initializeServer function...');

console.log('Initial serverState:', {
  hasWebSocketServer: !!serverState.websocketServer,
  websocketServer: serverState.websocketServer
});

// Create a test registry
const databasePath = new URL("../data/zsiistant.sqlite", import.meta.url).pathname;
const registry = new AgentRegistry({ databasePath });

try {
  console.log('\n🚀 Calling initializeServer...');
  const result = await initializeServer(registry);
  console.log('✅ initializeServer completed successfully');
  console.log('Result:', {
    server: !!result.server,
    config: !!result.config,
    providers: !!result.providers
  });
  console.log('Final serverState:', {
    hasWebSocketServer: !!serverState.websocketServer,
    websocketServer: serverState.websocketServer
  });
} catch (error) {
  console.log('❌ Error in initializeServer:', error.message);
  console.log('Error stack:', error.stack);
  console.log('ServerState after error:', {
    hasWebSocketServer: !!serverState.websocketServer,
    websocketServer: serverState.websocketServer
  });
}

process.exit(0);