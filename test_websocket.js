import { WebSocket } from 'ws';

console.log('Testing WebSocket connection...');

// Create WebSocket connection with API key and user agent
const ws = new WebSocket('ws://localhost:4000/ws?auth=test_websocket_key', {
  headers: {
    'User-Agent': 'Zsiistant-Test-Client/1.0'
  }
});

ws.on('open', function open() {
  console.log('WebSocket connection established');
  
  // Send a test ping message
  const testMessage = {
    type: 'ping',
    timestamp: Date.now()
  };
  
  console.log('Sending ping message:', testMessage);
  ws.send(JSON.stringify(testMessage));
  
  // Send a subscription message
  const subscriptionMessage = {
    type: 'subscribe',
    data: {
      sessionId: 'test_session_' + Date.now()
    },
    timestamp: Date.now()
  };
  
  console.log('Sending subscription message:', subscriptionMessage);
  ws.send(JSON.stringify(subscriptionMessage));
  
  // Close connection after a short delay
  setTimeout(() => {
    console.log('Closing WebSocket connection');
    ws.close();
  }, 5000);
});

ws.on('message', function incoming(data) {
  console.log('Received message:', data.toString());
  
  try {
    const parsed = JSON.parse(data.toString());
    console.log('Parsed message:', parsed);
    
    if (parsed.type === 'pong') {
      console.log('✅ Ping/pong test successful');
    }
    
    if (parsed.type === 'error') {
      console.error('❌ WebSocket error:', parsed);
    }
  } catch (e) {
    console.error('Failed to parse message:', e);
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('✅ WebSocket connection closed');
});

// Set timeout
setTimeout(() => {
  console.log('⏰ Test timeout, forcing connection close');
  if (ws.readyState !== 3) { // WebSocket.CLOSED
    ws.close();
  }
}, 10000);