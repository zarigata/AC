// Test WebSocket connection to verify client tracking
import WebSocket from 'ws';

console.log('Connecting WebSocket to test client tracking...');

const ws = new WebSocket('ws://localhost:4000/ws?auth=test_websocket_key', {
  headers: {
    'User-Agent': 'Zsiistant-Test/1.0'
  }
});

ws.on('open', () => {
  console.log('✅ WebSocket connected');
  
  // Check status after connection
  setTimeout(() => {
    console.log('📊 Checking WebSocket status after connection...');
    fetch('http://localhost:4000/api/ws/status')
      .then(res => res.json())
      .then(data => {
        console.log('📈 WebSocket status:', data);
        ws.close();
      })
      .catch(err => {
        console.error('❌ Error fetching status:', err);
        ws.close();
      });
  }, 1000);
});

ws.on('message', (data) => {
  console.log('📨 Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('🔌 WebSocket closed');
  
  // Check final status after disconnection
  setTimeout(() => {
    console.log('📊 Checking WebSocket status after disconnection...');
    fetch('http://localhost:4000/api/ws/status')
      .then(res => res.json())
      .then(data => {
        console.log('📈 Final WebSocket status:', data);
      })
      .catch(err => {
        console.error('❌ Error fetching final status:', err);
      });
  }, 1000);
});