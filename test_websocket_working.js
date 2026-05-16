import { WebSocket } from 'ws';

console.log('🔬 Testing WebSocket with Real Agent...');

const agentId = 'fd27e085-12f6-4846-930a-093e6009791d'; // QA-Temp agent
const sessionId = 'test_session_' + Date.now();

const testMessages = [
  { type: 'ping', timestamp: Date.now() },
  { type: 'subscribe', data: { sessionId: sessionId }, timestamp: Date.now() },
  { 
    type: 'chat', 
    data: { 
      message: 'Hi', 
      agentId: agentId
      // Don't provide sessionId - let the system create one automatically
    }, 
    timestamp: Date.now() 
  }
];

const runTest = (auth, testName) => {
  return new Promise((resolve) => {
    console.log(`\n📋 Testing: ${testName}`);
    try {
      const ws = new WebSocket(`ws://localhost:4000/ws?auth=${auth}`, {
        headers: { 'User-Agent': 'Zsiistant-Test-Client/1.0' }
      });
      
      let responses = [];
      let messageIndex = 0;
      
      ws.on('open', () => {
        console.log(`✅ Connected with auth: ${auth}`);
        
        // Send test messages with delays
        const sendMessage = () => {
          if (messageIndex < testMessages.length) {
            const msg = testMessages[messageIndex];
            console.log(`📤 Sending [${messageIndex}]:`, msg.type);
            ws.send(JSON.stringify(msg));
            messageIndex++;
            setTimeout(sendMessage, 2000); // 2 second delay between messages
          } else {
            // Close after all messages sent
            setTimeout(() => {
              console.log('🔚 Closing connection');
              ws.close();
              resolve(responses);
            }, 3000);
          }
        };
        
        sendMessage();
      });
      
      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          console.log(`📥 Received [${responses.length}]:`, parsed.type);
          responses.push(parsed);
        } catch (e) {
          console.log('📥 Raw message:', data.toString());
        }
      });
      
      ws.on('error', (err) => {
        console.log(`❌ Error with auth ${auth}:`, err.message);
        resolve(responses);
      });
      
      ws.on('close', () => {
        console.log(`🔚 Closed with auth: ${auth}`);
        resolve(responses);
      });
      
    } catch (err) {
      console.log(`❌ Failed to connect with auth ${auth}:`, err.message);
      resolve([]);
    }
  });
};

// Run test with correct auth
const runAllTests = async () => {
  console.log(`Using agent ID: ${agentId}`);
  console.log(`Using session ID: ${sessionId}`);
  
  const correctAuth = 'test_websocket_key';
  const responses = await runTest(correctAuth, 'Correct Auth');
  
  // Results summary
  console.log('\n📊 Test Results Summary:');
  console.log(`\n📋 Auth: ${correctAuth}`);
  console.log(`   Responses: ${responses.length}`);
  responses.forEach((resp, index) => {
    console.log(`   [${index}] ${resp.type}: ${resp.message || resp.content || 'OK'}`);
    if (resp.error) {
      console.log(`       Error: ${resp.error}`);
    }
  });
  
  console.log('\n🏁 WebSocket test completed');
  process.exit(0);
};

runAllTests().catch(console.error);