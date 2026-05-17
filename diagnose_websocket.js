#!/usr/bin/env node

/**
 * Diagnose WebSocket issues in the running container
 */

import WebSocket from 'isomorphic-ws';
import http from 'node:http';

console.log('🔍 Diagnosing WebSocket issues in running container...');

// Test 1: Check if the WebSocket endpoint is responding to HTTP requests
console.log('\n🧪 Test 1: WebSocket status endpoint...');
const getStatus = new Promise((resolve) => {
  const req = http.request('http://localhost:4000/api/ws/status', {
    headers: { 'X-API-Key': 'test-key' }
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

// Test 2: Try different WebSocket connection scenarios
console.log('\n🧪 Test 2: WebSocket connection scenarios...');

const scenarios = [
  { url: 'ws://localhost:4000/ws', auth: false, name: 'No auth' },
  { url: 'ws://localhost:4000/ws?auth=test-key', auth: true, name: 'With auth' },
  { url: 'ws://localhost:4000/ws?auth=invalid', auth: true, name: 'Invalid auth' }
];

const testScenarios = scenarios.map(scenario => {
  return new Promise((resolve) => {
    console.log(`\n  Testing: ${scenario.name} (${scenario.url})`);
    
    const ws = new WebSocket(scenario.url);
    let connected = false;
    let errored = false;
    
    const timeout = setTimeout(() => {
      if (!connected && !errored) {
        console.log(`  ❌ Timeout - no connection or error`);
        ws.terminate();
        resolve({ scenario: scenario.name, result: 'timeout' });
      }
    }, 3000);
    
    ws.on('open', () => {
      connected = true;
      clearTimeout(timeout);
      console.log(`  ✅ Connected successfully`);
      ws.close();
      resolve({ scenario: scenario.name, result: 'connected' });
    });
    
    ws.on('error', (error) => {
      errored = true;
      clearTimeout(timeout);
      console.log(`  ❌ Error: ${error.message} (${error.code})`);
      ws.terminate();
      resolve({ scenario: scenario.name, result: 'error', error: error.message });
    });
    
    ws.on('close', (code, reason) => {
      if (!connected) {
        console.log(`  🔒 Closed: ${code} - ${reason.toString()}`);
        resolve({ scenario: scenario.name, result: 'closed', code, reason: reason.toString() });
      }
    });
  });
});

// Test 3: Check available endpoints
console.log('\n🧪 Test 3: Available endpoints...');
const getEndpoints = new Promise((resolve) => {
  const req = http.request('http://localhost:4000/', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('Root Response:', res.statusCode, data);
      resolve({ status: res.statusCode, data });
    });
  });
  
  req.on('error', (error) => {
    console.log('Root Error:', error.message);
    resolve({ error: error.message });
  });
  
  req.end();
});

// Run all tests
Promise.all([getStatus, getEndpoints, ...testScenarios])
  .then(results => {
    console.log('\n📊 Test Results Summary:');
    results.forEach((result, index) => {
      if (index === 0) console.log('Status Endpoint:', result);
      else if (index === 1) console.log('Root Endpoint:', result);
      else console.log(`WebSocket Test ${index-1}:`, result);
    });
  })
  .catch(error => {
    console.log('❌ Test error:', error.message);
  })
  .finally(() => {
    process.exit(0);
  });