#!/usr/bin/env node

/**
 * Test script for validation middleware with correct schema requirements
 */

import { spawn } from 'child_process';

console.log('Testing Zsiistant Request Validation Middleware with correct schema requirements...\n');

// Test cases with correct schema requirements
const testCases = [
  {
    name: 'Valid POST request with all required fields',
    method: 'POST',
    path: '/api/agents',
    body: {
      name: 'TestAgent',
      purpose: 'Testing API functionality',
      provider: 'ollama',
      model: 'qwen3:1.7b',
      temperature: 0.7,
      maxTokens: 4000
    },
    expectedStatus: 201
  },
  {
    name: 'Invalid POST request - missing required field (purpose)',
    method: 'POST', 
    path: '/api/agents',
    body: {
      name: 'TestAgent',
      provider: 'ollama',
      model: 'qwen3:1.7b'
      // Missing required 'purpose' field
    },
    expectedStatus: 400
  },
  {
    name: 'Invalid POST request - wrong data type',
    method: 'POST',
    path: '/api/agents', 
    body: {
      name: 'TestAgent',
      purpose: 'Testing API functionality',
      provider: 'ollama',
      model: 'qwen3:1.7b',
      temperature: 'invalid' // Should be number, not string
    },
    expectedStatus: 400
  },
  {
    name: 'Valid PUT request',
    method: 'PUT',
    path: '/api/agents/test-id',
    body: {
      name: 'UpdatedAgent',
      temperature: 0.5
    },
    expectedStatus: 200 // Resource not found is expected for non-existent agent
  },
  {
    name: 'GET request (should not be validated)',
    method: 'GET',
    path: '/api/agents',
    expectedStatus: 200
  }
];

// Function to test endpoint using curl with proper JSON
function testEndpoint(testCase) {
  return new Promise((resolve) => {
    const curlCommand = [
      'curl', '-s', '-X', testCase.method,
      `http://localhost:4000${testCase.path}`,
      '-H', 'Content-Type: application/json',
      '-H', 'Accept: application/json'
    ];

    // Add body if present
    if (testCase.body) {
      curlCommand.push('-d', JSON.stringify(testCase.body));
    }

    console.log(`Command: curl ${curlCommand.slice(1).join(' ')}`);

    const child = spawn('curl', curlCommand.slice(1));
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const response = {
        status: code === 0 ? 200 : code,
        body: stdout,
        error: stderr,
        testCase
      };
      resolve(response);
    });
  });
}

// Run tests
async function runTests() {
  const results = [];

  for (const testCase of testCases) {
    console.log(`\nTesting: ${testCase.name}`);
    try {
      const response = await testEndpoint(testCase);
      results.push(response);
      
      console.log(`  Status: ${response.status} (expected: ${testCase.expectedStatus})`);
      if (response.body) {
        console.log(`  Response: ${response.body}`);
      }
      if (response.error) {
        console.log(`  Error: ${response.error}`);
      }
    } catch (error) {
      console.log(`  Failed: ${error.message}`);
      results.push({ error: error.message, testCase });
    }
  }

  // Summary
  console.log('\n=== Test Summary ===');
  const passed = results.filter(r => 
    !r.error && (r.status === r.testCase.expectedStatus)
  ).length;
  const total = results.length;
  
  console.log(`Passed: ${passed}/${total}`);
  console.log(`Failed: ${total - passed}/${total}`);

  if (passed === total) {
    console.log('\n✅ All tests passed! Validation middleware is working correctly.');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Validation middleware needs fixing.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);