// Debug webhook routes more thoroughly
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
      
      // Test the handler with various mock requests
      const testCases = [
        { method: 'GET', url: '/api/webhooks', desc: 'Webhook list' },
        { method: 'GET', url: '/api/webhooks/telegram-default', desc: 'Telegram webhook config' },
        { method: 'GET', url: '/api/webhooks/discord-default', desc: 'Discord webhook config' },
        { method: 'POST', url: '/api/webhooks/telegram', desc: 'Telegram webhook request' },
        { method: 'POST', url: '/api/webhooks/discord', desc: 'Discord webhook request' }
      ];
      
      for (const testCase of testCases) {
        const mockRequest = {
          method: testCase.method,
          url: testCase.url,
          headers: { host: 'localhost:4000' }
        };
        
        const mockResponse = {
          headersSent: false,
          writeHead: (code, headers) => {
            console.log(`\n✅ ${testCase.desc}: Response headers:`, code, headers);
          },
          end: (data) => {
            console.log(`✅ ${testCase.desc}: Response data:`, data);
          }
        };
        
        console.log(`\n🧪 Testing ${testCase.desc}: ${testCase.method} ${testCase.url}`);
        try {
          const result = handler(mockRequest, mockResponse);
          console.log(`📝 Handler returned:`, result);
        } catch (error) {
          console.error(`❌ ${testCase.desc} failed:`, error.message);
        }
      }
    }
  }
};

// Register webhook routes
console.log('Registering webhook routes...');
const handler = registerWebhookRoutes(mockServer, mockRegistry, mockProviders, mockFailoverChains, mockSettings);
console.log('Returned handler:', typeof handler);