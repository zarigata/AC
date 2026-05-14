import { AgentRegistry } from './apps/api/src/registry.js';

async function testServerDatabasePath() {
  console.log('=== TESTING SERVER DATABASE PATH ===');
  
  // Test the same logic that the server uses
  const databasePath = process.env.ZSIISTANT_DB_PATH ?? new URL("./data/zsiistant.sqlite", import.meta.url).pathname;
  console.log('Server database path:', databasePath);
  
  try {
    const registry = new AgentRegistry({ databasePath });
    
    // Test if we can get presets
    const presets = await registry.getAllPresets();
    console.log(`✅ Connected to database, found ${presets.length} presets`);
    
    // Test if the preset handler works
    const testRequest = {
      method: 'GET',
      url: '/api/presets',
      headers: { host: 'localhost:4000' }
    };
    
    const mockResponse = {
      _headersSent: false,
      _statusCode: null,
      _headers: {},
      _data: null,
      
      writeHead: function(status, headers) {
        console.log(`📝 writeHead: ${status}`);
        this._statusCode = status;
        this._headers = headers;
      },
      
      end: function(data) {
        console.log(`📝 end: ${data ? data.length : 0} bytes`);
        this._data = data;
        this._headersSent = true;
      },
      
      get headersSent() {
        return this._headersSent;
      }
    };
    
    // Import and test the preset handler
    const { registerPresetRoutes } = await import('./apps/api/src/routes/presets.js');
    
    const routeHandlers = [];
    const mockServer = {
      on: (event, handler) => {
        if (event === 'request') {
          routeHandlers.push(handler);
          console.log(`Handler registered for: ${event}`);
        }
      }
    };
    
    registerPresetRoutes(mockServer, registry);
    
    if (routeHandlers.length > 0) {
      const handler = routeHandlers[0];
      console.log('Calling preset handler...');
      
      const result = await handler(testRequest, mockResponse);
      console.log('Handler result:', result);
      console.log('Response status:', mockResponse._statusCode);
      console.log('Headers sent:', mockResponse.headersSent);
      
      if (mockResponse._data) {
        console.log('Response data:', mockResponse._data);
      }
      
      if (mockResponse._statusCode === 200 && mockResponse.headersSent) {
        console.log('✅ Preset handler works correctly!');
      } else {
        console.log('❌ Preset handler has issues');
      }
    } else {
      console.log('❌ No preset handlers registered');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testServerDatabasePath().catch(console.error);