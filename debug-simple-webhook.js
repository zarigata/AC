// Simple debug of webhook route logic
import { registerWebhookRoutes } from './apps/api/src/routes/webhooks.js';

console.log('Import successful');

// Create mock objects
const mockRegistry = {};
const mockProviders = {};
const mockFailoverChains = {};
const mockSettings = {};

// Create a mock server
const mockServer = {
  on: (event, handler) => {
    console.log(`Server registered handler for event: ${event}`);
    if (event === 'request') {
      console.log('Handler function type:', typeof handler);
      
      // Test the handler with a mock request
      const mockRequest = {
        method: 'GET',
        url: '/api/webhooks',
        headers: { host: 'localhost:4000' }
      };
      
      const mockResponse = {
        headersSent: false,
        writeHead: (code, headers) => {
          console.log(`\n✅ Response headers:`, code, headers);
        },
        end: (data) => {
          console.log(`✅ Response data:`, data);
        }
      };
      
      console.log('\n=== Testing webhook handler ===');
      console.log('Mock request:', mockRequest);
      
      // Call the handler
      try {
        console.log('Calling handler function...');
        const result = handler(mockRequest, mockResponse);
        console.log('Handler result:', result);
      } catch (error) {
        console.error('Handler error:', error);
        console.error('Stack:', error.stack);
      }
    }
  }
};

// Register the routes
console.log('\n=== Registering webhook routes ===');
const handler = registerWebhookRoutes(mockServer, mockRegistry, mockProviders, mockFailoverChains, mockSettings);
console.log('Handler returned:', typeof handler);