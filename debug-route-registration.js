import { registerPresetRoutes } from './apps/api/src/routes/presets.js';

async function testRouteRegistration() {
  console.log('Testing preset route registration...');
  
  // Create a mock server object that mimics the pseudo-server
  const routeHandlers = [];
  
  const mockServer = {
    on: (event, handler) => {
      console.log(`Registering handler for event: ${event}`);
      if (event === 'request') {
        routeHandlers.push(handler);
        console.log(`Handler added. Total handlers: ${routeHandlers.length}`);
      }
    },
    onRequest: (handler) => {
      console.log('onRequest called (old pattern)');
      routeHandlers.push(handler);
    }
  };
  
  // Test the route registration
  try {
    registerPresetRoutes(mockServer, null);
    console.log('✅ Route registration completed');
    console.log(`Total registered handlers: ${routeHandlers.length}`);
    
    // Test the handler if it exists
    if (routeHandlers.length > 0) {
      const handler = routeHandlers[0];
      console.log('Handler type:', typeof handler);
      console.log('Handler name:', handler.name || 'anonymous');
      
      // Test if it's an async function
      console.log('Is async:', handler.constructor.name === 'AsyncFunction');
    }
    
  } catch (error) {
    console.error('❌ Error during route registration:', error.message);
    console.error('Stack:', error.stack);
  }
}

testRouteRegistration().catch(console.error);