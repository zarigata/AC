import { WebSocket } from 'ws';

console.log('Testing WebSocket broadcasting functionality...');

// Test multiple clients sharing the same session
const clients = [];
const sharedSessionId = 'broadcast_test_session_' + Date.now();
const testResults = {
  connections: 0,
  subscriptions: 0,
  chatResponses: 0,
  broadcastMessages: 0,
  errors: 0
};

// Create a test client
function createTestClient(id) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:4000/ws?auth=test_websocket_key', {
      headers: {
        'User-Agent': `Zsiistant-Test-Client/${id}`
      }
    });

    let hasResponded = false;

    ws.on('open', () => {
      console.log(`✅ Client ${id} connected`);
      testResults.connections++;
      
      // Subscribe to the shared session
      const subscriptionMessage = {
        type: 'subscribe',
        data: {
          sessionId: sharedSessionId
        },
        timestamp: Date.now()
      };
      
      console.log(`📋 Client ${id} subscribing to session: ${sharedSessionId}`);
      ws.send(JSON.stringify(subscriptionMessage));
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        
        if (parsed.type === 'subscribed') {
          testResults.subscriptions++;
          console.log(`✅ Client ${id} subscribed to session ${parsed.sessionId}`);
          
          // Send a chat message after subscribing
          setTimeout(() => {
            if (!hasResponded) {
              const chatMessage = {
                type: 'chat',
                data: {
                  message: `Hello from client ${id}! This is a test message.`,
                  agentId: 'bbd64c45-f364-49cb-9bd6-d2c0ae5cef8c',
                  sessionId: sharedSessionId
                },
                timestamp: Date.now()
              };
              
              console.log(`💬 Client ${id} sending chat message`);
              ws.send(JSON.stringify(chatMessage));
              hasResponded = true;
            }
          }, 1000);
        }
        
        if (parsed.type === 'chat_response') {
          testResults.chatResponses++;
          console.log(`✅ Client ${id} received direct chat response:`, {
            message: parsed.message.substring(0, 50) + '...',
            tokensIn: parsed.tokensIn,
            tokensOut: parsed.tokensOut
          });
        }
        
        if (parsed.type === 'session_message') {
          testResults.broadcastMessages++;
          console.log(`📡 Client ${id} received BROADCAST message from another client!`);
          console.log(`   Message: ${parsed.data.message.substring(0, 50)}...`);
        }
        
        if (parsed.type === 'error') {
          testResults.errors++;
          console.error(`❌ Client ${id} error:`, parsed.message);
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    ws.on('error', (err) => {
      console.error(`❌ Client ${id} error:`, err);
      testResults.errors++;
    });

    ws.on('close', () => {
      console.log(`🔌 Client ${id} disconnected`);
    });

    clients.push({ id, ws });
    
    // Resolve when client is connected and subscribed
    ws.on('open', () => {
      setTimeout(() => {
        // Wait a bit more for subscription
        setTimeout(() => resolve(ws), 1000);
      }, 500);
    });
  });
}

// Test multiple clients sharing the same session
async function testBroadcasting() {
  console.log('🚀 Creating 2 test clients for broadcasting test...');
  
  await Promise.all([
    createTestClient(1),
    createTestClient(2)
  ]);

  console.log(`📊 All clients created. Waiting for messages...`);
  console.log(`Shared session ID: ${sharedSessionId}`);
  
  // Keep connections open for a bit to allow broadcasting
  setTimeout(() => {
    console.log('\n📈 FINAL BROADCAST TEST RESULTS:');
    console.log(`Connections established: ${testResults.connections}/2`);
    console.log(`Successful subscriptions: ${testResults.subscriptions}`);
    console.log(`Direct chat responses: ${testResults.chatResponses}`);
    console.log(`Broadcast messages received: ${testResults.broadcastMessages}`);
    console.log(`Errors encountered: ${testResults.errors}`);
    
    if (testResults.connections === 2 && testResults.subscriptions === 2) {
      if (testResults.broadcastMessages > 0) {
        console.log('\n🎉 BROADCASTING TEST PASSED! WebSocket real-time chat with session broadcasting is working.');
      } else {
        console.log('\n⚠️  Broadcasting test partially passed - clients connected and can chat, but broadcasting not detected.');
      }
    } else {
      console.log('\n❌ Broadcasting test failed - basic connection failed.');
    }
    
    // Close all clients
    clients.forEach(({ ws, id }) => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.close();
      }
    });
    
  }, 5000);
}

// Start the test
testBroadcasting().catch(console.error);

// Overall timeout
setTimeout(() => {
  console.log('\n⏰ Test timeout reached. Force closing all clients.');
  clients.forEach(({ ws, id }) => {
    if (ws.readyState !== 3) { // WebSocket.CLOSED
      ws.close();
    }
  });
}, 15000);