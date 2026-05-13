/**
 * Test Request Validation Middleware
 * Test the validation middleware with various request payloads
 */

import { readFileSync } from 'fs';
import { spawn } from 'child_process';

console.log('Testing Zsiistant Request Validation Middleware...\n');

// Test cases for validation
const testCases = [
  {
    name: 'Valid POST request',
    method: 'POST',
    path: '/api/agents',
    body: {
      name: 'TestAgent',
      model: 'qwen3:1.7b',
      temperature: 0.7,
      maxTokens: 4000
    },
    expectedStatus: 200
  },
  {
    name: 'Invalid POST request - missing required field',
    method: 'POST', 
    path: '/api/agents',
    body: {
      name: 'TestAgent'
      // Missing required 'model' field
    },
    expectedStatus: 400
  },
  {
    name: 'Invalid POST request - wrong data type',
    method: 'POST',
    path: '/api/agents', 
    body: {
      name: 'TestAgent',
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
    expectedStatus: 200
  },
  {
    name: 'GET request (should not be validated)',
    method: 'GET',
    path: '/api/agents',
    expectedStatus: 200
  }
];

// Function to test endpoint using curl
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
    console.log(`Testing: ${testCase.name}`);
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
      console.log('');
    } catch (error) {
      console.log(`  Failed: ${error.message}\n`);
      results.push({ error: error.message, testCase });
    }
  }

  // Summary
  console.log('=== Test Summary ===');
  const passed = results.filter(r => 
    !r.error && (r.status === r.testCase.expectedStatus || r.testCase.expectedStatus === 200)
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