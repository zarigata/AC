#!/usr/bin/env node

/**
 * Direct CORS test to see actual headers
 */

import { spawn } from 'node:child_process';

const BASE_URL = 'http://localhost:4000';

async function testHeaders() {
  console.log('🔍 Testing CORS headers directly...\n');
  
  // Test 2: Health endpoint with allowed origin
  console.log('Test 2: Health endpoint with allowed origin');
  const curl2 = spawn('curl', ['-i', '-H', 'Origin: http://localhost:3000', `${BASE_URL}/health`]);
  
  let stdout2 = '';
  curl2.stdout.on('data', (data) => stdout2 += data);
  
  await new Promise((resolve) => {
    curl2.on('close', () => {
      console.log('Response for localhost:3000:');
      console.log(stdout2);
      
      // Check for CORS headers
      const hasCorsOrigin = stdout2.includes('Access-Control-Allow-Origin: http://localhost:3000');
      const hasCorsCredentials = stdout2.includes('Access-Control-Allow-Credentials: true');
      
      console.log(`\nCORS Origin found: ${hasCorsOrigin}`);
      console.log(`CORS Credentials found: ${hasCorsCredentials}`);
      resolve();
    });
  });
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 4: Preflight request
  console.log('Test 4: Preflight OPTIONS request');
  const curl4 = spawn('curl', [
    '-X', 'OPTIONS',
    '-H', 'Origin: http://localhost:3000',
    '-H', 'Access-Control-Request-Method: POST',
    '-H', 'Access-Control-Request-Headers: Content-Type',
    `${BASE_URL}/health`
  ]);
  
  let stdout4 = '';
  curl4.stdout.on('data', (data) => stdout4 += data);
  
  await new Promise((resolve) => {
    curl4.on('close', () => {
      console.log('Preflight response:');
      console.log(stdout4);
      
      // Check for preflight headers
      const hasCorsOrigin = stdout4.includes('Access-Control-Allow-Origin: http://localhost:3000');
      const hasCorsMethods = stdout4.includes('Access-Control-Allow-Methods');
      
      console.log(`\nPreflight CORS Origin found: ${hasCorsOrigin}`);
      console.log(`Preflight CORS Methods found: ${hasCorsMethods}`);
      resolve();
    });
  });
}

testHeaders().catch(console.error);