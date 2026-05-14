import { AgentRegistry } from './apps/api/src/registry.js';
import { registerPresetRoutes } from './apps/api/src/routes/presets.js';

async function testPresetHandler() {
  console.log('Testing preset handler...');
  
  const databasePath = './data/zsiistant.sqlite';
  const registry = new AgentRegistry({ databasePath });
  
  // Create a mock request/response
  const mockRequest = {
    method: 'GET',
    url: '/api/presets',
    headers: {
      host: 'localhost:4000',
      'user-agent': 'test-agent'
    }
  };
  
  const mockResponse = {
    writeHead: function(status, headers) {
      console.log(`writeHead called with status: ${status}, headers:`, headers);
    },
    end: function(data) {
      console.log('Response ended with data:', data);
    },
    headersSent: false
  };
  
  // Create a mock server with the handler
  let handler;
  const mockServer = {
    on: (event, h) => {
      if (event === 'request') {
        handler = h;
        console.log('Handler registered');
      }
    }
  };
  
  try {
    registerPresetRoutes(mockServer, registry);
    console.log('✅ Route registration completed');
    
    if (handler) {
      console.log('Calling handler...');
      const result = await handler(mockRequest, mockResponse);
      console.log('Handler returned:', result);
      
      if (mockResponse.headersSent) {
        console.log('✅ Response was sent');
      } else {
        console.log('❌ Response was not sent');
      }
    } else {
      console.log('❌ No handler registered');
    }
    
  } catch (error) {
    console.error('❌ Error during handler execution:', error.message);
    console.error('Stack:', error.stack);
  }
}

testPresetHandler().catch(console.error);