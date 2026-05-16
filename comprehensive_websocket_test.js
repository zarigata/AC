import { WebSocket } from 'ws';

console.log('🔬 Comprehensive WebSocket Test...');

const testMessages = [
  { type: 'ping', timestamp: Date.now() },
  { type: 'subscribe', data: { sessionId: 'test_session_123' }, timestamp: Date.now() },
  { type: 'chat', data: { message: 'Hello WebSocket!', agentId: 'test_agent', sessionId: 'test_session_123' }, timestamp: Date.now() }
];

const runTest = (auth, testName) => {
  return new Promise((resolve) => {
    console.log(`\n📋 Testing: ${testName}`);
    try {
      const ws = new WebSocket(`ws://localhost:4000/ws?auth=${auth}`, {
        headers: { 'User-Agent': 'Zsiistant-Test-Client/1.0' }
      });
      
      let responses = [];
      
      ws.on('open', () => {
        console.log(`✅ Connected with auth: ${auth}`);
        
        // Send test messages
        testMessages.forEach((msg, index) => {
          setTimeout(() => {
            console.log(`📤 Sending [${index}]:`, msg.type);
            ws.send(JSON.stringify(msg));
          }, index * 1000);
        });
        
        // Close after delay
        setTimeout(() => {
          console.log('🔚 Closing connection');
          ws.close();
          resolve(responses);
        }, 5000);
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

// Run tests sequentially
const runAllTests = async () => {
  const results = [];
  
  // Test with correct auth
  const correctAuth = 'test_websocket_key';
  const correctResponses = await runTest(correctAuth, 'Correct Auth');
  results.push({ auth: correctAuth, responses: correctResponses });
  
  // Test with wrong auth
  const wrongAuth = 'wrong_key';
  const wrongResponses = await runTest(wrongAuth, 'Wrong Auth');
  results.push({ auth: wrongAuth, responses: wrongResponses });
  
  // Test without auth
  const noAuth = '';
  const noAuthResponses = await runTest(noAuth, 'No Auth');
  results.push({ auth: noAuth, responses: noAuthResponses });
  
  // Results summary
  console.log('\n📊 Test Results Summary:');
  results.forEach(result => {
    console.log(`\n📋 Auth: ${result.auth}`);
    console.log(`   Responses: ${result.responses.length}`);
    result.responses.forEach(resp => {
      console.log(`   - ${resp.type}: ${resp.message || 'OK'}`);
    });
  });
  
  console.log('\n🏁 Comprehensive test completed');
  process.exit(0);
};

runAllTests().catch(console.error);