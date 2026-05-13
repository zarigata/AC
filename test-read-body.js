#!/usr/bin/env node

/**
 * Test the readRequestBody function directly
 */

import { readRequestBody } from './apps/api/src/middleware/validationMiddleware.js';

console.log('Testing readRequestBody function...\n');

// Mock request object
const mockRequest = {
  method: 'POST',
  on: (event, handler) => {
    console.log(`Mock request: on('${event}')`);
    if (event === 'data') {
      // Simulate incoming JSON data
      handler('{"name":"TestAgent","model":"qwen3:1.7b"}');
    } else if (event === 'end') {
      handler();
    }
  }
};

async function testReadRequestBody() {
  try {
    console.log('Testing readRequestBody with mock request...');
    const body = await readRequestBody(mockRequest);
    console.log('✅ readRequestBody result:', body);
    console.log('Name:', body.name);
    console.log('Model:', body.model);
  } catch (error) {
    console.log('❌ readRequestBody error:', error.message);
  }
}

testReadRequestBody().catch(console.error);