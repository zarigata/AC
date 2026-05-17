import { WebSocket } from 'ws';

console.log('Testing WebSocket chat functionality...');

// Create WebSocket connection with API key
const ws = new WebSocket('ws://localhost:4000/ws?auth=test_websocket_key', {
  headers: {
    'User-Agent': 'Zsiistant-Test-Client/1.0'
  }
});

ws.on('open', function open() {
  console.log('WebSocket connection established');
  
  // First, subscribe to a session
  const subscriptionMessage = {
    type: 'subscribe',
    data: {
      sessionId: 'test_chat_session_' + Date.now()
    },
    timestamp: Date.now()
  };
  
  console.log('Sending subscription message:', subscriptionMessage);
  ws.send(JSON.stringify(subscriptionMessage));
  
  // Wait for subscription confirmation, then send a chat message
  setTimeout(() => {
    const chatMessage = {
      type: 'chat',
      data: {
        message: 'Hello, this is a test message from WebSocket!',
        agentId: 'bbd64c45-f364-49cb-9bd6-d2c0ae5cef8c', // 'test' agent
        sessionId: subscriptionMessage.data.sessionId
      },
      timestamp: Date.now()
    };
    
    console.log('Sending chat message:', chatMessage);
    ws.send(JSON.stringify(chatMessage));
    
    // Close after receiving response
    setTimeout(() => {
      console.log('Closing WebSocket connection');
      ws.close();
    }, 5000);
  }, 1000);
});

ws.on('message', function incoming(data) {
  console.log('Received message:', data.toString());
  
  try {
    const parsed = JSON.parse(data.toString());
    console.log('Parsed message:', parsed);
    
    if (parsed.type === 'pong') {
      console.log('✅ Ping/pong test successful');
    }
    
    if (parsed.type === 'subscribed') {
      console.log('✅ Subscription successful');
    }
    
    if (parsed.type === 'chat_response') {
      console.log('✅ Chat response received:', {
        message: parsed.message,
        tokensIn: parsed.tokensIn,
        tokensOut: parsed.tokensOut,
        duration: parsed.duration
      });
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
}, 15000);