#!/usr/bin/env node

/**
 * Security Test Script
 * Tests security improvements made to the Zsiistant API
 */

import http from 'node:http';

const BASE_URL = 'http://localhost:4000';

// Test helpers
const test = (name, testFn) => {
  console.log(`\n🔒 Testing: ${name}`);
  return testFn();
};

const request = (options, data) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(data);
    }
    req.end();
  });
};

// Run security tests
async function runSecurityTests() {
  console.log('🚀 Starting Security Tests...\n');
  
  try {
    // Test 1: CORS Protection
    await test('CORS Origin Validation', async () => {
      // Test with invalid origin
      const response = await request({
        hostname: 'localhost',
        port: 4000,
        path: '/api/settings',
        method: 'GET',
        headers: { 'Origin': 'http://malicious.com' }
      });
      
      if (response.status === 403) {
        console.log('✅ CORS correctly blocks malicious origin');
        return true;
      } else {
        console.log('❌ CORS failed to block malicious origin');
        return false;
      }
    });

    // Test 2: Rate Limiting
    await test('Rate Limiting', async () => {
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(request({
          hostname: 'localhost',
          port: 4000,
          path: '/api/settings',
          method: 'GET',
          headers: { 'Origin': 'http://localhost:4000' }
        }));
      }
      
      const responses = await Promise.all(requests);
      const successful = responses.filter(r => r.status === 200).length;
      
      if (successful === 5) {
        console.log(`✅ Rate limiting allows normal traffic (${successful}/5 requests successful)`);
        return true;
      } else {
        console.log(`❌ Rate limiting may be too restrictive (${successful}/5 requests successful)`);
        return false;
      }
    });

    // Test 3: Input Validation
    await test('Input Validation - SQL Injection', async () => {
      const maliciousInput = {
        name: "Robert'); DROP TABLE agents;--",
        purpose: "Testing SQL injection",
        provider: "openai",
        model: "gpt-4o-mini",
        isolationMode: "isolated",
        maxConcurrentTasks: 1,
        peerAccess: false
      };
      
      const response = await request({
        hostname: 'localhost',
        port: 4000,
        path: '/api/agents',
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:4000'
        }
      }, JSON.stringify(maliciousInput));
      
      if (response.status === 400) {
        console.log('✅ Input validation correctly rejects SQL injection attempts');
        return true;
      } else {
        console.log('❌ Input validation failed to block SQL injection');
        return false;
      }
    });

    // Test 4: XSS Protection
    await test('XSS Protection', async () => {
      const xssInput = {
        name: "Test<script>alert('XSS')</script>",
        purpose: "Testing XSS protection",
        provider: "openai",
        model: "gpt-4o-mini",
        isolationMode: "isolated",
        maxConcurrentTasks: 1,
        peerAccess: false
      };
      
      const response = await request({
        hostname: 'localhost',
        port: 4000,
        path: '/api/agents',
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:4000'
        }
      }, JSON.stringify(xssInput));
      
      if (response.status === 400) {
        console.log('✅ XSS protection correctly rejects malicious scripts');
        return true;
      } else {
        console.log('❌ XSS protection failed to block malicious scripts');
        return false;
      }
    });

    // Test 5: File Upload Security
    await test('File Upload Security', async () => {
      // First create a test agent
      const timestamp = Date.now();
      const uniqueAgentName = `test-agent-${timestamp}`;
      
      const agentResponse = await request({
        hostname: 'localhost',
        port: 4000,
        path: '/api/agents',
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:4000'
        }
      }, JSON.stringify({
        name: uniqueAgentName,
        purpose: "Testing file upload security",
        provider: "ollama",
        model: "qwen3",
        isolationMode: "isolated",
        maxConcurrentTasks: 1,
        peerAccess: false
      }));
      
      // Extract agent ID from response
      let agentId = uniqueAgentName; // fallback
      try {
        console.log('Agent creation response:', agentResponse.body);
        const agentData = JSON.parse(agentResponse.body);
        if (agentData.agent && agentData.agent.id) {
          agentId = agentData.agent.id;
        }
      } catch (e) {
        console.log('Error parsing agent response:', e);
      }
      
      console.log('Created agent:', uniqueAgentName, 'ID:', agentId);
      
      const maliciousFile = {
        content: "<script>alert('XSS in file')</script>",
        filename: "malicious.html",
        originalName: "malicious.html"
      };
      
      const response = await request({
        hostname: 'localhost',
        port: 4000,
        path: `/api/agents/${agentId}/files`,
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:4000'
        }
      }, JSON.stringify(maliciousFile));
      
      if (response.status === 400) {
        console.log('✅ File upload security correctly rejects malicious content');
        return true;
      } else {
        console.log('❌ File upload security failed to block malicious content');
        return false;
      }
    });

    // Test 6: JSON Parsing Security
    await test('JSON Parsing Security', async () => {
      const maliciousJson = JSON.stringify({
        name: "Test",
        "__proto__": { "polluted": true }
      });
      
      const response = await request({
        hostname: 'localhost',
        port: 4000,
        path: '/api/agents',
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:4000'
        }
      }, maliciousJson);
      
      if (response.status === 400) {
        console.log('✅ JSON parsing correctly rejects prototype pollution attempts');
        return true;
      } else {
        console.log('❌ JSON parsing failed to block prototype pollution');
        return false;
      }
    });

    // Test 7: Path Traversal Protection
    await test('Path Traversal Protection', async () => {
      const response = await request({
        hostname: 'localhost',
        port: 4000,
        path: '/api/../../etc/passwd',
        method: 'GET',
        headers: { 'Origin': 'http://localhost:4000' }
      });
      
      if (response.status === 403 || response.status === 404) {
        console.log('✅ Path traversal protection correctly blocks directory traversal');
        return true;
      } else {
        console.log('❌ Path traversal protection failed to block directory traversal (status: ' + response.status + ')');
        return false;
      }
    });

    // Test 8: Integer Validation
    await test('Integer Validation', async () => {
      const invalidInput = {
        name: "Test",
        purpose: "Testing integer validation",
        provider: "openai",
        model: "gpt-4o-mini",
        isolationMode: "isolated",
        maxConcurrentTasks: 999999, // Too large
        peerAccess: false
      };
      
      const response = await request({
        hostname: 'localhost',
        port: 4000,
        path: '/api/agents',
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:4000'
        }
      }, JSON.stringify(invalidInput));
      
      if (response.status === 400) {
        console.log('✅ Integer validation correctly rejects out-of-bounds values');
        return true;
      } else {
        console.log('❌ Integer validation failed to reject out-of-bounds values');
        return false;
      }
    });

    console.log('\n🎉 Security Tests Completed!');
    
  } catch (error) {
    console.error('❌ Security test failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
runSecurityTests().catch(console.error);