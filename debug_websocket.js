#!/usr/bin/env node

import { WebSocket } from 'ws';

console.log('🔍 Debug WebSocket connection...');

// Test 1: Basic connection without auth
console.log('\n1. Testing basic connection...');
try {
  const ws1 = new WebSocket('ws://localhost:4000/ws');
  
  ws1.on('open', () => {
    console.log('✅ Basic WebSocket connection opened');
    ws1.close();
  });
  
  ws1.on('error', (err) => {
    console.log('❌ Basic connection error:', err.message);
  });
  
  ws1.on('close', () => {
    console.log('🔚 Basic connection closed');
  });
} catch (err) {
  console.log('❌ Basic connection failed:', err.message);
}

// Test 2: Connection with auth
console.log('\n2. Testing connection with auth...');
try {
  const ws2 = new WebSocket('ws://localhost:4000/ws?auth=test_websocket_key', {
    headers: {
      'User-Agent': 'Zsiistant-Debug-Client/1.0'
    }
  });
  
  ws2.on('open', () => {
    console.log('✅ Authenticated WebSocket connection opened');
    
    // Test ping
    const pingMsg = { type: 'ping', timestamp: Date.now() };
    ws2.send(JSON.stringify(pingMsg));
    console.log('📤 Sent ping:', pingMsg);
  });
  
  ws2.on('message', (data) => {
    console.log('📥 Received message:', data.toString());
    
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'pong') {
        console.log('✅ Ping/pong working');
      }
    } catch (e) {
      console.log('⚠️  Could not parse message');
    }
  });
  
  ws2.on('error', (err) => {
    console.log('❌ Authenticated connection error:', err.message);
  });
  
  ws2.on('close', () => {
    console.log('🔚 Authenticated connection closed');
  });
} catch (err) {
  console.log('❌ Authenticated connection failed:', err.message);
}

// Test 3: Connection with wrong auth
console.log('\n3. Testing connection with wrong auth...');
try {
  const ws3 = new WebSocket('ws://localhost:4000/ws?auth=wrong_key', {
    headers: {
      'User-Agent': 'Zsiistant-Debug-Client/1.0'
    }
  });
  
  ws3.on('open', () => {
    console.log('⚠️  Connection opened with wrong auth (unexpected)');
    ws3.close();
  });
  
  ws3.on('error', (err) => {
    console.log('❌ Wrong auth error:', err.message);
  });
  
  ws3.on('close', () => {
    console.log('🔚 Wrong auth connection closed');
  });
} catch (err) {
  console.log('❌ Wrong auth connection failed:', err.message);
}

setTimeout(() => {
  console.log('\n🏁 Debug test completed');
  process.exit(0);
}, 15000);