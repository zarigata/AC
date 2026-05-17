#!/usr/bin/env node

/**
 * Debug WebSocket URL parsing
 */

import WebSocket from 'isomorphic-ws';
import http from 'node:http';

const SERVER_URL = 'ws://localhost:4000/ws';

console.log('🔍 Debugging WebSocket URL...');

// First, let's test the HTTP endpoint to see if the server is responding
const testRequest = http.request('http://localhost:4000/health', (res) => {
  console.log('HTTP Response status:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('HTTP Response body:', data);
    
    // Now test WebSocket
    console.log('\n🔧 Testing WebSocket connection...');
    const ws = new WebSocket(SERVER_URL);
    
    ws.on('open', () => {
      console.log('✅ WebSocket connection opened!');
      ws.close();
    });
    
    ws.on('error', (error) => {
      console.log('❌ WebSocket error:', error.message);
      console.log('Error code:', error.code);
    });
    
    ws.on('close', (code, reason) => {
      console.log('🔒 WebSocket closed:', code, reason.toString());
    });
  });
});

testRequest.on('error', (error) => {
  console.log('❌ HTTP request error:', error.message);
});

testRequest.end();