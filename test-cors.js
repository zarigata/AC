#!/usr/bin/env node

/**
 * Test CORS functionality for Zsiistant API
 */

import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const BASE_URL = 'http://localhost:4000';
const TEST_API_KEY = 'zsiistant-test-api-key-12345';

/**
 * Execute a curl command and return the result
 */
async function curlCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const curl = spawn('curl', ['-i', '-v', ...args], { ...options, encoding: 'utf8' });
    
    let stdout = '';
    let stderr = '';
    let headers = {};
    let body = '';
    
    curl.stdout.on('data', (data) => {
      stdout += data;
    });
    
    curl.stderr.on('data', (data) => {
      stderr += data;
    });
    
    curl.on('close', (code) => {
      // Parse HTTP headers from curl output
      // Find the end of HTTP headers (\r\n\r\n)
      const headerEnd = stdout.indexOf('\r\n\r\n');
      if (headerEnd > 0) {
        const headerText = stdout.substring(0, headerEnd);
        const bodyText = stdout.substring(headerEnd + 4);
        
        // Parse only HTTP status line and headers, ignore JSON body
        const headerLines = headerText.split('\n');
        headerLines.forEach(line => {
          // Skip HTTP status line (starts with HTTP/)
          if (!line.startsWith('HTTP/') && line.trim() !== '') {
            const match = line.match(/^(.+?):\s*(.+)$/);
            if (match) {
              headers[match[1].trim()] = match[2].trim();
            }
          }
        });
        
        body = bodyText;
      }
      
      resolve({
        success: code === 0 || code === 204, // 204 is valid for OPTIONS
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        headers,
        body,
        code
      });
    });
    
    curl.on('error', reject);
  });
}

/**
 * Test CORS functionality
 */
async function testCors() {
  console.log('🧪 Testing CORS functionality...\n');
  
  const results = [];
  
  // Test 1: Health endpoint without origin (should not have CORS headers)
  console.log('Test 1: Health endpoint without origin');
  const result1 = await curlCommand([`${BASE_URL}/health`]);
  console.log('Response headers:', result1.stdout);
  
  if (result1.success) {
    const hasCORS = result1.headers['Access-Control-Allow-Origin'];
    results.push({ name: 'Health endpoint no origin', passed: !hasCORS, details: hasCORS ? 'Has CORS headers' : 'No CORS headers' });
    console.log(`✅ ${!hasCORS ? 'Correctly no CORS headers' : '❌ Unexpected CORS headers'}`);
  } else {
    results.push({ name: 'Health endpoint no origin', passed: false, details: 'Request failed' });
    console.log('❌ Request failed');
  }
  
  console.log();
  
  // Test 2: Health endpoint with allowed origin
  console.log('Test 2: Health endpoint with allowed origin (localhost:3000)');
  const result2 = await curlCommand(['-H', 'Origin: http://localhost:3000', `${BASE_URL}/health`]);
  
  if (result2.success) {
    const hasCORS = result2.headers['Access-Control-Allow-Origin'] === 'http://localhost:3000';
    const hasCredentials = result2.headers['Access-Control-Allow-Credentials'] === 'true';
    results.push({ 
      name: 'Health endpoint allowed origin', 
      passed: hasCORS && hasCredentials, 
      details: `CORS: ${hasCORS}, Credentials: ${hasCredentials}` 
    });
    console.log(`✅ ${hasCORS && hasCredentials ? 'Correct CORS headers' : '❌ Missing CORS headers'}`);
  } else {
    results.push({ name: 'Health endpoint allowed origin', passed: false, details: 'Request failed' });
    console.log('❌ Request failed');
  }
  
  console.log();
  
  // Test 3: Health endpoint with malicious origin
  console.log('Test 3: Health endpoint with malicious origin');
  const result3 = await curlCommand(['-H', 'Origin: http://malicious-site.com', `${BASE_URL}/health`]);
  
  if (result3.success) {
    const hasCORS = result3.headers['Access-Control-Allow-Origin'];
    results.push({ name: 'Health endpoint malicious origin', passed: !hasCORS, details: hasCORS ? 'Has CORS headers' : 'No CORS headers' });
    console.log(`✅ ${!hasCORS ? 'Correctly blocked malicious origin' : '❌ CORS headers present for malicious origin'}`);
  } else {
    results.push({ name: 'Health endpoint malicious origin', passed: false, details: 'Request failed' });
    console.log('❌ Request failed');
  }
  
  console.log();
  
  // Test 4: Preflight request
  console.log('Test 4: Preflight OPTIONS request');
  const result4 = await curlCommand([
    '-X', 'OPTIONS',
    '-H', 'Origin: http://localhost:3000',
    '-H', 'Access-Control-Request-Method: POST',
    '-H', 'Access-Control-Request-Headers: Content-Type, X-API-Key',
    `${BASE_URL}/api/agents`
  ]);
  
  if (result4.success && (result4.code === 204 || result4.code === 0)) {
    const hasCORS = result4.headers['Access-Control-Allow-Origin'] === 'http://localhost:3000';
    const hasMethods = result4.headers['Access-Control-Allow-Methods'];
    results.push({ name: 'Preflight request', passed: hasCORS && hasMethods, details: `CORS: ${hasCORS}, Methods: ${hasMethods}` });
    console.log(`✅ ${hasCORS && hasMethods ? 'Correct preflight response' : '❌ Missing preflight headers'}`);
  } else {
    results.push({ name: 'Preflight request', passed: false, details: `Unexpected response: ${result4.code}` });
    console.log('❌ Preflight request failed');
  }
  
  console.log();
  
  // Test 5: Protected endpoint with valid API key and CORS
  console.log('Test 5: Protected endpoint with API key and CORS');
  const result5 = await curlCommand([
    '-H', 'Origin: http://localhost:3000',
    '-H', `X-API-Key: ${TEST_API_KEY}`,
    `${BASE_URL}/api/agents`
  ]);
  
  if (result5.success) {
    const hasCORS = result5.stdout.includes('Access-Control-Allow-Origin');
    const hasAuth = result5.stdout.includes('X-Authenticated: true');
    const agentsData = result5.stdout.includes('"agents"');
    results.push({ 
      name: 'Protected endpoint with API key', 
      passed: hasCORS && hasAuth && agentsData, 
      details: `CORS: ${hasCORS}, Auth: ${hasAuth}, Data: ${agentsData}` 
    });
    console.log(`✅ ${hasCORS && hasAuth && agentsData ? 'Correct CORS and authentication' : '❌ Missing CORS or authentication'}`);
  } else {
    results.push({ name: 'Protected endpoint with API key', passed: false, details: 'Request failed' });
    console.log('❌ Request failed');
  }
  
  console.log();
  
  // Test 6: Protected endpoint without API key but with CORS origin
  console.log('Test 6: Protected endpoint without API key but with CORS origin');
  const result6 = await curlCommand([
    '-H', 'Origin: http://localhost:3000',
    `${BASE_URL}/api/agents`
  ]);
  
  if (result6.success) {
    const hasCORS = result6.stdout.includes('Access-Control-Allow-Origin');
    const hasAuthError = result6.stdout.includes('"code":"AUTH_UNAUTHORIZED"');
    results.push({ 
      name: 'Protected endpoint no API key', 
      passed: hasCORS && hasAuthError, 
      details: `CORS: ${hasCORS}, Auth Error: ${hasAuthError}` 
    });
    console.log(`✅ ${hasCORS && hasAuthError ? 'Correct CORS and authentication error' : '❌ Missing CORS or missing auth error'}`);
  } else {
    results.push({ name: 'Protected endpoint no API key', passed: false, details: 'Request failed' });
    console.log('❌ Request failed');
  }
  
  // Summary
  console.log('\n📊 Test Summary:');
  console.log('=' .repeat(50));
  
  const passedTests = results.filter(r => r.passed).length;
  const totalTests = results.length;
  
  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name}: ${result.details}`);
  });
  
  console.log(`\n🎯 Result: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All CORS tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed');
    process.exit(1);
  }
}

// Run tests
testCors().catch(console.error);