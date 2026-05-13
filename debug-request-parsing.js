#!/usr/bin/env node

/**
 * Debug script to test request body parsing
 */

import { spawn } from 'child_process';

console.log('Debug request body parsing...\n');

// Test with a simple request that logs what's received
const testCases = [
  {
    name: 'Debug: Simple POST request with JSON',
    method: 'POST',
    path: '/api/agents',
    body: {
      name: 'DebugAgent',
      model: 'qwen3:1.7b'
    }
  }
];

function testEndpoint(testCase) {
  return new Promise((resolve) => {
    const curlCommand = [
      'curl', '-s', '-X', testCase.method,
      `http://localhost:4000${testCase.path}`,
      '-H', 'Content-Type: application/json',
      '-H', 'Accept: application/json',
      '-H', 'User-Agent: Debug-Test/1.0'
    ];

    if (testCase.body) {
      curlCommand.push('-d', JSON.stringify(testCase.body));
    }

    console.log(`Command: ${curlCommand.slice(1).join(' ')}`);

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
      resolve({
        status: code === 0 ? 200 : code,
        body: stdout,
        error: stderr,
        testCase
      });
    });
  });
}

// Run tests
async function runTests() {
  for (const testCase of testCases) {
    console.log(`\nTesting: ${testCase.name}`);
    try {
      const response = await testEndpoint(testCase);
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${response.body}`);
      if (response.error) {
        console.log(`Error: ${response.error}`);
      }
    } catch (error) {
      console.log(`Failed: ${error.message}`);
    }
  }
}

runTests().catch(console.error);