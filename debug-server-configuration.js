import { AgentRegistry } from './apps/api/src/registry.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function debugServerConfiguration() {
  console.log('=== DEBUG SERVER CONFIGURATION ===');
  
  // Check package.json
  try {
    const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
    console.log('Package.json config:');
    console.log('- Type:', packageJson.type);
    console.log('- Main:', packageJson.main);
    console.log('- Version:', packageJson.version);
  } catch (error) {
    console.error('Error reading package.json:', error.message);
  }
  
  // Check database configuration
  console.log('\n--- Database Configuration ---');
  
  // Test different database paths
  const databasePaths = [
    './data/zsiistant.sqlite',
    new URL('../data/zsiistant.sqlite', import.meta.url).pathname,
    '/app/data/zsiistant.sqlite',
    process.env.ZSIISTANT_DB_PATH
  ];
  
  for (const path of databasePaths) {
    if (!path) continue;
    
    console.log(`\nTesting database path: ${path}`);
    
    try {
      const registry = new AgentRegistry({ databasePath: path });
      
      // Test if we can connect and get presets
      const presets = await registry.getAllPresets();
      console.log(`✅ Connected successfully, found ${presets.length} presets`);
      
      // Test if the handler works with this registry
      const testPreset = {
        id: `test-${Date.now()}`,
        name: 'Test Config',
        description: 'Test preset for config',
        configTemplate: { test: true },
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await registry.createPreset(testPreset);
      console.log('✅ Created test preset successfully');
      
      const updatedPresets = await registry.getAllPresets();
      console.log(`✅ Now found ${updatedPresets.length} presets`);
      
    } catch (error) {
      console.log(`❌ Error with path ${path}:`, error.message);
    }
  }
  
  // Check server configuration
  console.log('\n--- Server Configuration ---');
  
  try {
    const { settings, serverState } = await import('./apps/api/src/config/serverConfig.js');
    console.log('Server settings:');
    console.log('- Version:', settings.version);
    console.log('- Port:', settings.port);
    console.log('- CORS allowed origins:', settings.cors?.allowedOrigins);
    console.log('- Max agents:', settings.maxAgents);
    console.log('- Server state:', serverState);
  } catch (error) {
    console.error('Error loading server config:', error.message);
  }
  
  // Check route handlers
  console.log('\n--- Route Handlers Check ---');
  
  try {
    const { registerPresetRoutes } = await import('./apps/api/src/routes/presets.js');
    
    const routeHandlers = [];
    const mockServer = {
      on: (event, handler) => {
        if (event === 'request') {
          routeHandlers.push(handler);
          console.log(`Handler added for event: ${event}`);
        }
      }
    };
    
    registerPresetRoutes(mockServer, null);
    
    console.log(`✅ Registered ${routeHandlers.length} preset handlers`);
    
    if (routeHandlers.length > 0) {
      const handler = routeHandlers[0];
      console.log('Handler details:');
      console.log('- Type:', typeof handler);
      console.log('- Name:', handler.name || 'anonymous');
      console.log('- Length:', handler.length);
      
      // Test handler with different request objects
      const testRequests = [
        {
          method: 'GET',
          url: '/api/presets',
          headers: { host: 'localhost:4000' }
        },
        {
          method: 'GET',
          url: 'http://localhost:4000/api/presets',
          headers: { host: 'localhost:4000' }
        },
        {
          method: 'GET',
          url: '/api/presets',
          headers: { host: '127.0.0.1:4000' }
        }
      ];
      
      for (const request of testRequests) {
        console.log(`\nTesting with request: ${request.method} ${request.url}`);
        
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
        
        try {
          const result = await handler(request, mockResponse);
          console.log('Result:', result);
          console.log('Status:', mockResponse._statusCode);
          console.log('Headers sent:', mockResponse.headersSent);
          
          if (mockResponse._data) {
            console.log('Data preview:', mockResponse._data.substring(0, 100) + '...');
          }
          
        } catch (error) {
          console.error('Handler error:', error.message);
        }
      }
    }
    
  } catch (error) {
    console.error('Error checking route handlers:', error.message);
    console.error('Stack:', error.stack);
  }
  
  console.log('\n=== CONFIGURATION DEBUG COMPLETE ===');
}

debugServerConfiguration().catch(console.error);