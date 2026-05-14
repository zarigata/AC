import { AgentRegistry } from './apps/api/src/registry.js';
import { registerPresetRoutes } from './apps/api/src/routes/presets.js';

async function testServerFlow() {
  console.log('Testing server flow simulation...');
  
  const databasePath = './data/zsiistant.sqlite';
  const registry = new AgentRegistry({ databasePath });
  
  // Create a mock response that tracks headersSent like Node.js does
  const mockResponse = {
    _headersSent: false,
    _statusCode: null,
    _headers: {},
    
    writeHead: function(status, headers) {
      if (this._headersSent) {
        throw new Error('Headers already sent');
      }
      this._statusCode = status;
      this._headers = { ...headers };
      console.log(`writeHead called with status: ${status}, headers:`, headers);
    },
    
    end: function(data) {
      if (this._headersSent) {
        throw new Error('End already called');
      }
      this._headersSent = true;
      this._data = data;
      console.log('Response ended with data length:', data ? data.length : 0);
    },
    
    get headersSent() {
      return this._headersSent;
    }
  };
  
  // Create a mock server with the handler
  const routeHandlers = [];
  const mockServer = {
    on: (event, handler) => {
      if (event === 'request') {
        routeHandlers.push(handler);
        console.log('Handler registered. Total handlers:', routeHandlers.length);
      }
    }
  };
  
  try {
    // Simulate server initialization
    registerPresetRoutes(mockServer, registry);
    console.log('✅ Route registration completed');
    
    // Simulate actual server request handling
    const mockRequest = {
      method: 'GET',
      url: '/api/presets',
      headers: {
        host: 'localhost:4000',
        'user-agent': 'test-agent'
      }
    };
    
    console.log('\n--- Simulating server request handling ---');
    console.log('Request:', mockRequest.method, mockRequest.url);
    
    // Simulate the route handler loop
    let handled = false;
    for (const handler of routeHandlers) {
      console.log(`\nTrying handler ${routeHandlers.indexOf(handler) + 1}/${routeHandlers.length}...`);
      console.log('Headers sent before handler:', mockResponse.headersSent);
      
      try {
        const result = await handler(mockRequest, mockResponse);
        console.log('Handler returned:', result);
        console.log('Headers sent after handler:', mockResponse.headersSent);
        
        if (result !== false && mockResponse.headersSent) {
          handled = true;
          break;
        }
      } catch (err) {
        console.error('Handler error:', err.message);
      }
    }
    
    console.log('\n--- Request handling complete ---');
    console.log('Request was handled:', handled);
    console.log('Final response status:', mockResponse._statusCode);
    console.log('Final headers sent:', mockResponse.headersSent);
    
    if (mockResponse.headersSent && mockResponse._data) {
      console.log('Response data preview:', mockResponse._data.substring(0, 100) + '...');
    }
    
    if (!handled) {
      console.log('❌ No handler handled the request - would trigger 404');
    } else {
      console.log('✅ Request was handled successfully');
    }
    
  } catch (error) {
    console.error('❌ Error during server flow simulation:', error.message);
    console.error('Stack:', error.stack);
  }
}

testServerFlow().catch(console.error);