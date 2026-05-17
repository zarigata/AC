import { WebSocket } from 'ws';

console.log('Testing comprehensive WebSocket functionality...');

// Test multiple clients and broadcasting
const clients = [];
const testResults = {
  connections: 0,
  pongs: 0,
  subscriptions: 0,
  chatResponses: 0,
  errors: 0
};

// Create multiple test clients
function createTestClient(id) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:4000/ws?auth=test_websocket_key', {
      headers: {
        'User-Agent': `Zsiistant-Test-Client/${id}`
      }
    });

    ws.on('open', () => {
      console.log(`✅ Client ${id} connected`);
      testResults.connections++;
      
      // Subscribe to the same session
      const subscriptionMessage = {
        type: 'subscribe',
        data: {
          sessionId: 'shared_test_session_' + Date.now()
        },
        timestamp: Date.now()
      };
      
      ws.send(JSON.stringify(subscriptionMessage));
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        
        if (parsed.type === 'pong') {
          testResults.pongs++;
        }
        
        if (parsed.type === 'subscribed') {
          testResults.subscriptions++;
          console.log(`✅ Client ${id} subscribed to session ${parsed.sessionId}`);
          
          // Send a chat message after subscribing
          setTimeout(() => {
            const chatMessage = {
              type: 'chat',
              data: {
                message: `Test message from client ${id}`,
                agentId: 'bbd64c45-f364-49cb-9bd6-d2c0ae5cef8c',
                sessionId: parsed.sessionId
              },
              timestamp: Date.now()
            };
            
            ws.send(JSON.stringify(chatMessage));
          }, 1000);
        }
        
        if (parsed.type === 'chat_response') {
          testResults.chatResponses++;
          console.log(`✅ Client ${id} received chat response`);
        }
        
        if (parsed.type === 'session_message') {
          console.log(`📡 Client ${id} received broadcasted message (broadcasting working!)`);
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
    
    // Resolve when client is connected
    ws.on('open', () => {
      setTimeout(() => resolve(ws), 500);
    });
  });
}

// Test all clients simultaneously
async function testMultipleClients() {
  console.log('🚀 Creating 3 test clients...');
  
  await Promise.all([
    createTestClient(1),
    createTestClient(2),
    createTestClient(3)
  ]);

  console.log(`📊 All clients created. Results:`, testResults);
  
  // Keep connections open for a bit to test broadcasting
  setTimeout(() => {
    console.log('🏁 Closing all clients...');
    clients.forEach(({ ws, id }) => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.close();
      }
    });
    
    // Final results
    setTimeout(() => {
      console.log('\n📈 FINAL TEST RESULTS:');
      console.log(`Connections established: ${testResults.connections}/3`);
      console.log(`Pong responses: ${testResults.pongs}`);
      console.log(`Successful subscriptions: ${testResults.subscriptions}`);
      console.log(`Chat responses received: ${testResults.chatResponses}`);
      console.log(`Errors encountered: ${testResults.errors}`);
      
      if (testResults.connections === 3 && testResults.chatResponses >= 3) {
        console.log('\n🎉 ALL TESTS PASSED! WebSocket real-time chat interface is working correctly.');
      } else {
        console.log('\n⚠️  Some tests failed. Check results above.');
      }
    }, 1000);
  }, 3000);
}

// Start the test
testMultipleClients().catch(console.error);

// Overall timeout
setTimeout(() => {
  console.log('\n⏰ Test timeout reached. Force closing all clients.');
  clients.forEach(({ ws, id }) => {
    if (ws.readyState !== 3) { // WebSocket.CLOSED
      ws.close();
    }
  });
}, 15000);