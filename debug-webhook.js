// Debug webhook routes
import { registerWebhookRoutes } from './apps/api/src/routes/webhooks.js';

// Mock objects for testing
const mockRegistry = {};
const mockProviders = {};
const mockFailoverChains = {};
const mockSettings = {};

// Create a mock server
const mockServer = {
  on: (event, handler) => {
    console.log('Mock server registered handler for event:', event);
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
          console.log('Response headers:', code, headers);
        },
        end: (data) => {
          console.log('Response data:', data);
        }
      };
      
      console.log('Testing webhook handler with /api/webhooks...');
      handler(mockRequest, mockResponse);
    }
  }
};

// Register webhook routes
console.log('Registering webhook routes...');
const handler = registerWebhookRoutes(mockServer, mockRegistry, mockProviders, mockFailoverChains, mockSettings);
console.log('Returned handler:', typeof handler);