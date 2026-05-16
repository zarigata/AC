import WebSocket from 'ws';

console.log('Testing WebSocket connection to Zsiistant...');

// Test WebSocket connection
const ws = new WebSocket('ws://localhost:4000/ws?auth=test_websocket_key', {
  headers: {
    'User-Agent': 'Zsiistant-Test-Client/1.0'
  }
});

ws.on('open', function open() {
  console.log('✅ WebSocket connection established');
  
  // Test ping
  ws.send(JSON.stringify({ type: 'ping' }));
  
  // Test chat message
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'chat',
      data: {
        message: 'Hello, test message!',
        agentId: '07fa06ff-0f1c-4fef-ac87-2c1e5d384849' // TestAgentWithPrompt
      }
    }));
  }, 1000);
  
  // Test subscription
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'subscribe',
      data: {
        sessionId: 'test-session-123'
      }
    }));
  }, 2000);
});

ws.on('message', function message(data) {
  console.log('📨 Received message:', data.toString());
});

ws.on('error', function error(err) {
  console.log('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
  console.log('🔌 WebSocket connection closed');
});

// Test timeout
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
    console.log('WebSocket test completed');
  }
}, 5000);