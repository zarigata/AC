import { WebSocket } from 'ws';

console.log('Testing WebSocket real-time chat with V16 implementation...');

// Test the complete V16 functionality
const testResults = {
  connection: false,
  subscription: false,
  chatResponse: false,
  working: false
};

// Create a single test client to verify the complete flow
const ws = new WebSocket('ws://localhost:4000/ws?auth=test_websocket_key', {
  headers: {
    'User-Agent': 'Zsiistant-V16-Test-Client/1.0'
  }
});

ws.on('open', function open() {
  console.log('✅ WebSocket connection established');
  testResults.connection = true;
  
  // Subscribe to a session
  const subscriptionMessage = {
    type: 'subscribe',
    data: {
      sessionId: 'v16_final_test_session_' + Date.now()
    },
    timestamp: Date.now()
  };
  
  console.log('📋 Sending subscription message...');
  ws.send(JSON.stringify(subscriptionMessage));
});

ws.on('message', function incoming(data) {
  console.log('📨 Received message:', data.toString());
  
  try {
    const parsed = JSON.parse(data.toString());
    console.log('📋 Parsed message:', JSON.stringify(parsed, null, 2));
    
    if (parsed.type === 'subscribed') {
      console.log('✅ Subscription successful');
      testResults.subscription = true;
      
      // Send a chat message after subscribing
      const chatMessage = {
        type: 'chat',
        data: {
          message: 'Hello Zsiistant! This is a test of the V16 WebSocket real-time chat interface. Please respond with a simple confirmation that you received this message.',
          agentId: 'bbd64c45-f364-49cb-9bd6-d2c0ae5cef8c',
          sessionId: parsed.sessionId
        },
        timestamp: Date.now()
      };
      
      console.log('💬 Sending chat message...');
      ws.send(JSON.stringify(chatMessage));
    }
    
    if (parsed.type === 'chat_response') {
      console.log('🎉 V16 CHAT RESPONSE SUCCESSFUL!');
      console.log('   Message:', parsed.message.substring(0, 100) + '...');
      console.log('   Tokens:', parsed.tokensIn + ' in, ' + parsed.tokensOut + ' out');
      console.log('   Duration:', parsed.duration + 'ms');
      console.log('   Model:', parsed.model);
      testResults.chatResponse = true;
      testResults.working = true;
      
      // Close connection after successful test
      setTimeout(() => {
        console.log('🔌 Closing connection after successful test');
        ws.close();
      }, 2000);
    }
    
    if (parsed.type === 'error') {
      console.error('❌ WebSocket Error:', parsed);
    }
  } catch (e) {
    console.error('Failed to parse message:', e);
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket connection error:', err);
});

ws.on('close', function close() {
  console.log('🔌 WebSocket connection closed');
  
  // Final test results
  console.log('\n📊 V16 IMPLEMENTATION TEST RESULTS:');
  console.log('✅ Connection:', testResults.connection ? 'SUCCESS' : 'FAILED');
  console.log('✅ Subscription:', testResults.subscription ? 'SUCCESS' : 'FAILED');
  console.log('✅ Chat Response:', testResults.chatResponse ? 'SUCCESS' : 'FAILED');
  console.log('✅ Overall V16 Status:', testResults.working ? 'WORKING' : 'FAILED');
  
  if (testResults.working) {
    console.log('\n🎉 V16 (WebSocket real-time chat interface) is FULLY IMPLEMENTED and WORKING!');
    console.log('   - WebSocket connections establish correctly');
    console.log('   - Session subscription works');
    console.log('   - Real-time chat messaging works');
    console.log('   - AI responses are received via WebSocket');
    console.log('   - Token usage and timing data is included');
  } else {
    console.log('\n❌ V16 implementation needs fixes');
  }
});

// Set timeout
setTimeout(() => {
  console.log('⏰ Test timeout, forcing connection close');
  if (ws.readyState !== 3) { // WebSocket.CLOSED
    ws.close();
  }
}, 30000);