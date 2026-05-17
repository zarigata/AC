// Test WebSocket connection
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:4000/ws?auth=test_websocket_key', {
  headers: {
    'User-Agent': 'Zsiistant-Test/1.0'
  }
});

ws.on('open', () => {
  console.log('WebSocket connected');
  
  // Test ping
  ws.send(JSON.stringify({ type: 'ping' }));
  
  // Test chat message
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'chat',
      data: {
        message: 'Hello WebSocket',
        agentId: 'test_agent'
      }
    }));
  }, 1000);
  
  // Test subscription
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'subscribe',
      data: {
        sessionId: 'test_session'
      }
    }));
  }, 2000);
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('WebSocket closed');
});