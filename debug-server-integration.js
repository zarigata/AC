import { AgentRegistry } from './apps/api/src/registry.js';

async function debugServerIntegration() {
  console.log('=== DEBUG SERVER INTEGRATION ===');
  
  const databasePath = './data/zsiistant.sqlite';
  const registry = new AgentRegistry({ databasePath });
  
  // Simulate the exact server setup process
  const routeHandlers = [];
  const makeRouteRegistrar = () => ({
    on(event, handler) {
      if (event === 'request') {
        routeHandlers.push(handler);
        console.log(`Handler added. Total handlers: ${routeHandlers.length}`);
      }
    }
  });
  
  const routeServer = makeRouteRegistrar();
  
  // Simulate the server registration process
  console.log('Simulating server registration process...');
  
  try {
    // Import and register preset routes
    const { registerPresetRoutes } = await import('./apps/api/src/routes/presets.js');
    registerPresetRoutes(routeServer, registry);
    
    console.log(`✅ Registered handlers: ${routeHandlers.length}`);
    
    // Test each handler
    for (let i = 0; i < routeHandlers.length; i++) {
      const handler = routeHandlers[i];
      console.log(`\n--- Testing handler ${i + 1}/${routeHandlers.length} ---`);
      console.log('Handler type:', typeof handler);
      console.log('Handler name:', handler.name || 'anonymous');
      
      // Create mock request/response
      const mockRequest = {
        method: 'GET',
        url: '/api/presets',
        headers: {
          host: 'localhost:4000',
          'user-agent': 'test-agent'
        }
      };
      
      const mockResponse = {
        _headersSent: false,
        _statusCode: null,
        _headers: {},
        _data: null,
        
        writeHead: function(status, headers) {
          console.log(`📝 writeHead called with status: ${status}`);
          this._statusCode = status;
          this._headers = { ...headers };
        },
        
        end: function(data) {
          console.log(`📝 end called with data length: ${data ? data.length : 0}`);
          this._data = data;
          this._headersSent = true;
        },
        
        get headersSent() {
          return this._headersSent;
        }
      };
      
      try {
        console.log('Calling handler...');
        const result = await handler(mockRequest, mockResponse);
        console.log('Handler returned:', result);
        console.log('Headers sent:', mockResponse.headersSent);
        console.log('Status code:', mockResponse._statusCode);
        
        if (mockResponse.headersSent) {
          console.log('✅ Handler processed request successfully');
          console.log('Response preview:', mockResponse._data.substring(0, 100) + '...');
        } else {
          console.log('❌ Handler did not process request');
        }
        
      } catch (error) {
        console.error('❌ Handler error:', error.message);
        console.error('Stack:', error.stack);
      }
    }
    
    // Simulate the server request handling loop
    console.log('\n--- Simulating server request handling loop ---');
    
    const mockRequest = {
      method: 'GET',
      url: '/api/presets',
      headers: {
        host: 'localhost:4000',
        'user-agent': 'test-agent'
      }
    };
    
    const mockResponse = {
      _headersSent: false,
      _statusCode: null,
      _headers: {},
      _data: null,
      
      writeHead: function(status, headers) {
        console.log(`Server writeHead called with status: ${status}`);
        this._statusCode = status;
        this._headers = { ...headers };
      },
      
      end: function(data) {
        console.log(`Server end called with data length: ${data ? data.length : 0}`);
        this._data = data;
        this._headersSent = true;
      },
      
      get headersSent() {
        return this._headersSent;
      }
    };
    
    console.log('Starting server handler loop...');
    let handled = false;
    
    for (const handler of routeHandlers) {
      console.log(`Trying handler...`);
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
        console.error('Handler error in loop:', err.message);
      }
    }
    
    console.log('Final request handling result:', handled);
    console.log('Final response status:', mockResponse._statusCode);
    console.log('Final response data preview:', mockResponse._data ? mockResponse._data.substring(0, 100) + '...' : 'null');
    
    if (!handled) {
      console.log('❌ No handler handled the request - would trigger 404');
    } else {
      console.log('✅ Request was handled successfully');
    }
    
  } catch (error) {
    console.error('❌ Error in server integration test:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugServerIntegration().catch(console.error);