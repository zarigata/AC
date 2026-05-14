import { AgentRegistry } from './apps/api/src/registry.js';

// Create a test preset
async function createTestPreset() {
  console.log('Creating test preset...');
  
  const databasePath = './data/zsiistant.sqlite';
  const registry = new AgentRegistry({ databasePath });
  
  const testPreset = {
    id: 'debug-test-preset-' + Date.now(),
    name: 'Debug Test Preset ' + Date.now(),
    description: 'A test preset for debugging',
    configTemplate: { debug: true, test: 'value' },
    icon: null,
    category: 'debug',
    isSystem: false,
    isFeatured: false,
    orderIndex: 0,
    tags: ['debug'],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  try {
    await registry.createPreset(testPreset);
    console.log('✅ Test preset created');
    
    const presets = await registry.getAllPresets();
    console.log('Total presets:', presets.length);
    
    return true;
  } catch (error) {
    console.error('❌ Error creating test preset:', error.message);
    return false;
  }
}

// Test the preset handler directly
async function testPresetHandler() {
  console.log('Testing preset handler directly...');
  
  const databasePath = './data/zsiistant.sqlite';
  const registry = new AgentRegistry({ databasePath });
  
  // Simulate a request that matches what the server would receive
  const mockRequest = {
    method: 'GET',
    url: '/api/presets',
    headers: {
      host: 'localhost:4000',
      'user-agent': 'debug-test'
    }
  };
  
  // Create a mock response that logs everything
  const mockResponse = {
    _headersSent: false,
    _statusCode: null,
    _headers: {},
    _data: null,
    
    writeHead: function(status, headers) {
      console.log(`📝 writeHead called with status: ${status}`);
      console.log(`📝 Headers:`, headers);
      this._statusCode = status;
      this._headers = { ...headers };
      
      if (this._headersSent) {
        console.log('❌ ERROR: Headers already sent!');
        throw new Error('Headers already sent');
      }
    },
    
    end: function(data) {
      console.log(`📝 end called with data length: ${data ? data.length : 0}`);
      console.log(`📝 Data preview:`, data ? data.substring(0, 100) + '...' : 'null');
      
      if (this._headersSent) {
        console.log('❌ ERROR: End already called!');
        throw new Error('End already called');
      }
      
      this._headersSent = true;
      this._data = data;
    },
    
    get headersSent() {
      return this._headersSent;
    }
  };
  
  // Load and call the preset handler directly
  try {
    console.log('Loading preset handler...');
    const { registerPresetRoutes } = await import('./apps/api/src/routes/presets.js');
    
    console.log('Registering preset routes...');
    let presetHandler = null;
    const mockServer = {
      on: (event, handler) => {
        console.log(`Handler registered for event: ${event}`);
        if (event === 'request') {
          console.log('✅ Preset handler registered');
          presetHandler = handler;
        }
      }
    };
    
    // Call registerPresetRoutes to get the handler
    registerPresetRoutes(mockServer, registry);
    
    console.log('Calling preset handler...');
    
    if (!presetHandler) {
      console.log('❌ No handler found');
      return false;
    }
    
    console.log('Executing handler...');
    const result = await presetHandler(mockRequest, mockResponse);
    
    console.log('Handler result:', result);
    console.log('Final status:', mockResponse._statusCode);
    console.log('Final headers sent:', mockResponse.headersSent);
    
    if (mockResponse._data) {
      console.log('Response data:', mockResponse._data);
    }
    
    return result === true && mockResponse.headersSent;
    
  } catch (error) {
    console.error('❌ Error in preset handler test:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Main test
async function main() {
  console.log('=== DEBUG REAL HANDLER TEST ===');
  
  // First, create a test preset
  const presetCreated = await createTestPreset();
  if (!presetCreated) {
    console.log('❌ Failed to create test preset');
    return;
  }
  
  // Then test the handler
  const handlerWorked = await testPresetHandler();
  
  console.log('\n=== TEST RESULTS ===');
  console.log('Preset created:', presetCreated);
  console.log('Handler worked:', handlerWorked);
  
  if (handlerWorked) {
    console.log('✅ All tests passed!');
  } else {
    console.log('❌ Tests failed!');
  }
}

main().catch(console.error);