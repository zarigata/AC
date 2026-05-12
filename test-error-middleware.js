/**
 * Test script for error middleware functionality
 */

import { createServer } from 'node:http';
import { globalErrorHandler, notFoundHandler, createErrorResponse } from './apps/api/src/middleware/errorMiddleware.js';

// Create a test server
const testServer = createServer((req, res) => {
  // Simulate different error scenarios based on URL path
  if (req.url === '/test-500') {
    throw new Error('Test 500 error');
  } else if (req.url === '/test-404') {
    // Route to 404 handler
    notFoundHandler(req, res);
  } else if (req.url === '/test-validation') {
    const validationError = new Error('Invalid input data');
    validationError.name = 'ValidationError';
    throw validationError;
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Test server running' }));
  }
});

// Apply global error handler
testServer.on('error', globalErrorHandler);

// Start server on port 4001 to avoid conflicts
const PORT = 4001;

testServer.listen(PORT, '127.0.0.1', () => {
  console.log(`Test server running on http://127.0.0.1:${PORT}`);
  console.log('Test endpoints:');
  console.log(`  GET http://127.0.0.1:${PORT}/test-500 (should return 500 error)`);
  console.log(`  GET http://127.0.0.1:${PORT}/test-404 (should return 404 error)`);
  console.log(`  GET http://127.0.0.1:${PORT}/test-validation (should return 400 error)`);
  console.log(`  GET http://127.0.0.1:${PORT}/ (should return 200 success)`);
  
  // Test error response creation
  console.log('\n=== Testing Error Response Creation ===');
  
  const mockReq = {
    url: '/test',
    method: 'GET',
    headers: { 'user-agent': 'test-agent' },
    socket: { remoteAddress: '127.0.0.1' }
  };
  
  // Test server error
  const serverError = new Error('Test server error');
  const serverErrorResponse = createErrorResponse(serverError, mockReq);
  console.log('Server error response:', JSON.stringify(serverErrorResponse, null, 2));
  
  // Test validation error
  const validationError = new Error('Invalid input');
  validationError.name = 'ValidationError';
  const validationErrorResponse = createErrorResponse(validationError, mockReq);
  console.log('Validation error response:', JSON.stringify(validationErrorResponse, null, 2));
  
  // Test not found error
  const notFoundError = new Error('Resource not found');
  const notFoundErrorResponse = createErrorResponse(notFoundError, mockReq);
  console.log('Not found error response:', JSON.stringify(notFoundErrorResponse, null, 2));
  
  console.log('\n=== Test completed ===');
  
  // Close server after tests
  setTimeout(() => {
    testServer.close();
    console.log('Test server closed');
  }, 5000);
});