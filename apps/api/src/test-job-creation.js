// Test script for job creation
import { readRequestBody } from './middleware/requestHandler.js';

// Mock request object
const mockRequest = {
  headers: {
    'content-type': 'application/json'
  },
  // Simulate a readable stream with JSON data
  on: function(event, callback) {
    if (event === 'data') {
      callback('{"name": "Test Job", "type": "test"}');
    } else if (event === 'end') {
      callback();
    }
  }
};

// Test the request body parsing
async function testRequestBody() {
  try {
    const body = await readRequestBody(mockRequest);
    console.log('Parsed body:', body);
    console.log('Name:', body.name);
    console.log('Type:', body.type);
    
    // Test job creation
    const jobData = { name: body.name, type: body.type };
    console.log('Job data for creation:', jobData);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testRequestBody();