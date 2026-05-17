#!/usr/bin/env node

/**
 * Test WebSocket status endpoint specifically
 */

import http from 'node:http';
import WebSocket from 'isomorphic-ws';

console.log('🔍 Testing WebSocket status endpoint...');

// Test 1: Test the HTTP status endpoint
console.log('\n🧪 Test 1: HTTP status endpoint...');
const getStatus = new Promise((resolve) => {
  const req = http.request('http://localhost:4000/api/ws/status', {
    method: 'GET',
    headers: { 'User-Agent': 'test' }
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('Status Response:', res.statusCode, data);
      resolve({ status: res.statusCode, data });
    });
  });
  
  req.on('error', (error) => {
    console.log('Status Error:', error.message);
    resolve({ error: error.message });
  });
  
  req.end();
});

// Test 2: Test WebSocket connection to /ws endpoint
console.log('\n🧪 Test 2: WebSocket connection...');
const testWebSocket = new Promise((resolve) => {
  console.log('Testing WebSocket connection to ws://localhost:4000/ws');
  
  const ws = new WebSocket('ws://localhost:4000/ws');
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected!');
    ws.close();
    resolve({ result: 'connected' });
  });
  
  ws.on('error', (error) => {
    console.log('❌ WebSocket error:', error.message);
    resolve({ result: 'error', error: error.message });
  });
  
  ws.on('close', (code, reason) => {
    console.log('🔒 WebSocket closed:', code, reason.toString());
    resolve({ result: 'closed', code, reason: reason.toString() });
  });
  
  // Timeout after 5 seconds
  setTimeout(() => {
    if (ws.readyState !== ws.CLOSED) {
      ws.terminate();
    }
    resolve({ result: 'timeout' });
  }, 5000);
});

// Run tests
Promise.all([getStatus, testWebSocket])
  .then(results => {
    console.log('\n📊 Test Results:');
    console.log('Status Endpoint:', results[0]);
    console.log('WebSocket Connection:', results[1]);
  })
  .catch(error => {
    console.log('❌ Test error:', error.message);
  })
  .finally(() => {
    process.exit(0);
  });