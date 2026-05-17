#!/usr/bin/env node

/**
 * Debug WebSocket setup manually
 */

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { setupWebSocketServer, serverState } from './apps/api/src/config/serverConfig.js';

console.log('🔍 Debugging WebSocket setup...');

console.log('Initial serverState:', {
  hasWebSocketServer: !!serverState.websocketServer,
  websocketServer: serverState.websocketServer
});

// Create a simple HTTP server
const server = createServer();

// Setup WebSocket server manually
console.log('\n🔧 Setting up WebSocket server manually...');
try {
  const wss = setupWebSocketServer(server);
  console.log('✅ WebSocket server created:', wss);
  console.log('Server state after setup:', {
    hasWebSocketServer: !!serverState.websocketServer,
    websocketServer: serverState.websocketServer
  });
} catch (error) {
  console.log('❌ Error setting up WebSocket server:', error.message);
}

// Set up upgrade handler manually
console.log('\n🔧 Setting up upgrade handler manually...');
server.on('upgrade', (request, socket, head) => {
  console.log('Upgrade request received for:', request.url);
  console.log('Server state:', {
    hasWebSocketServer: !!serverState.websocketServer,
    websocketServer: serverState.websocketServer
  });
  
  if (serverState.websocketServer) {
    console.log('✅ WebSocket server available, handling upgrade...');
    serverState.websocketServer.handleUpgrade(request, socket, head, (ws) => {
      console.log('✅ WebSocket upgrade successful!');
      ws.on('message', (message) => {
        console.log('Received message:', message.toString());
      });
      ws.send('Hello from WebSocket server!');
    });
  } else {
    console.log('❌ WebSocket server not available');
    socket.destroy();
  }
});

// Start the server on a different port to avoid conflicts
server.listen(4001, () => {
  console.log('\n🚀 Test server listening on port 4001');
  console.log('WebSocket endpoint: ws://localhost:4001/ws');
  
  // Test the WebSocket connection
  setTimeout(() => {
    console.log('\n🧪 Testing WebSocket connection...');
    // This would be where we test the connection
    // For now, just log that we're ready to test
  }, 1000);
});

// Stop the server after 10 seconds
setTimeout(() => {
  console.log('\n🛑 Stopping test server...');
  server.close();
  process.exit(0);
}, 10000);