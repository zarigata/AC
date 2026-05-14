#!/usr/bin/env node

/**
 * Test script for system prompts feature
 */

import { spawn } from 'child_process';

console.log('Testing Zsiistant System Prompts Feature...\n');

// Test cases for system prompts
const testCases = [
  {
    name: 'Create agent with system prompt',
    method: 'POST',
    path: '/api/agents',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'zsiistant-test-api-key-12345'
    },
    body: {
      name: 'TestAgentWithPrompt',
      purpose: 'Testing system prompts functionality',
      provider: 'ollama',
      model: 'qwen3:1.7b',
      systemPrompt: 'You are a helpful AI assistant. Be concise and accurate in your responses.'
    },
    expectedStatus: 201,
    checkForError: false
  },
  {
    name: 'Create agent without system prompt',
    method: 'POST',
    path: '/api/agents',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'zsiistant-test-api-key-12345'
    },
    body: {
      name: 'TestAgentWithoutPrompt',
      purpose: 'Testing basic agent functionality',
      provider: 'ollama',
      model: 'qwen3:1.7b'
    },
    expectedStatus: 201,
    checkForError: false
  },
  {
    name: 'Update agent to add system prompt',
    method: 'PATCH',
    path: '/api/agents/test-id',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'zsiistant-test-api-key-12345'
    },
    body: {
      systemPrompt: 'You are an expert assistant with specialized knowledge.'
    },
    expectedStatus: 200,
    checkForError: false
  },
  {
    name: 'Update agent with long system prompt (should fail)',
    method: 'PATCH',
    path: '/api/agents/test-id',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'zsiistant-test-api-key-12345'
    },
    body: {
      systemPrompt: 'x'.repeat(3000) // 3000 characters, exceeds 2000 limit
    },
    expectedStatus: 400,
    checkForError: true
  }
];

// Function to test endpoint using curl
function testEndpoint(testCase) {
  return new Promise((resolve) => {
    const curlCommand = ['curl', '-s', '-X', testCase.method];
    
    // Add headers
    for (const [key, value] of Object.entries(testCase.headers)) {
      curlCommand.push('-H', `${key}: ${value}`);
    }
    
    // Add path
    curlCommand.push(`http://localhost:4000${testCase.path}`);
    
    // Add body if present
    if (testCase.body) {
      curlCommand.push('-d', JSON.stringify(testCase.body));
    }

    console.log(`\nTesting: ${testCase.name}`);
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

// Check if response indicates error
function hasError(response) {
  try {
    const parsed = JSON.parse(response.body);
    return parsed.error !== undefined;
  } catch {
    return true;
  }
}

// Run tests
async function runTests() {
  const results = [];

  for (const testCase of testCases) {
    try {
      const response = await testEndpoint(testCase);
      results.push(response);
      
      console.log(`  Status: ${response.status} (expected: ${testCase.expectedStatus})`);
      if (response.body) {
        console.log(`  Response: ${response.body.substring(0, 200)}...`);
      }
      
      // Check test requirements
      const hasErrorResponse = hasError(response);
      let passed = false;
      
      if (testCase.checkForError) {
        // Test should have an error
        passed = response.status === testCase.expectedStatus && hasErrorResponse;
        if (!passed) {
          console.log(`  ❌ Expected error but got status=${response.status}, hasError=${hasErrorResponse}`);
        } else {
          console.log(`  ✅ Error correctly detected`);
        }
      } else {
        // Test should NOT have an error
        passed = response.status === testCase.expectedStatus && !hasErrorResponse;
        if (!passed) {
          console.log(`  ❌ Expected no error but got status=${response.status}, hasError=${hasErrorResponse}`);
        } else {
          console.log(`  ✅ No error as expected`);
        }
      }
      
    } catch (error) {
      console.log(`  Failed: ${error.message}`);
      results.push({ error: error.message, testCase });
    }
  }

  // Summary
  console.log('\n=== System Prompts Test Summary ===');
  const passed = results.filter(r => 
    !r.error && r.status === r.testCase.expectedStatus && 
    (r.testCase.checkForError ? hasError(r) : !hasError(r))
  ).length;
  const total = results.length;
  
  console.log(`Passed: ${passed}/${total}`);
  console.log(`Failed: ${total - passed}/${total}`);

  if (passed === total) {
    console.log('\n🎉 ALL TESTS PASSED! System prompts feature is working correctly.');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);