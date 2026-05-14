#!/usr/bin/env node

/**
 * Debug CORS test to understand test script behavior
 */

import { spawn } from 'node:child_process';

const BASE_URL = 'http://localhost:4000';

async function debugCurl() {
  console.log('🔍 Debug CORS test...\n');
  
  // Test with origin header
  console.log('Testing with origin header...');
  const curl = spawn('curl', ['-i', '-H', 'Origin: http://localhost:3000', `${BASE_URL}/health`]);
  
  let stdout = '';
  let stderr = '';
  
  curl.stdout.on('data', (data) => {
    stdout += data;
  });
  
  curl.stderr.on('data', (data) => {
    stderr += data;
  });
  
  await new Promise((resolve) => {
    curl.on('close', (code) => {
      console.log('Exit code:', code);
      console.log('STDOUT:');
      console.log(stdout);
      console.log('\nSTDERR:');
      console.log(stderr);
      console.log('\nHeaders parsing:');
      
      // Try to parse headers
      const lines = stdout.split('\n');
      const headers = {};
      
      for (const line of lines) {
        const match = line.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          headers[match[1].trim()] = match[2].trim();
          console.log(`Found header: ${match[1].trim()} = ${match[2].trim()}`);
        }
      }
      
      console.log('\nFinal headers object:');
      console.log(JSON.stringify(headers, null, 2));
      
      resolve();
    });
  });
}

debugCurl().catch(console.error);