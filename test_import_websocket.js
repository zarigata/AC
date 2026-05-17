#!/usr/bin/env node

/**
 * Test importing WebSocket handler functions
 */

console.log('🔍 Testing WebSocket handler imports...');

async function testImport() {
  try {
    const { getConnectedClients } = await import('./apps/api/src/middleware/webSocketHandler.js');
    console.log('✅ Successfully imported getConnectedClients');
    console.log('Function type:', typeof getConnectedClients);
    
    if (typeof getConnectedClients === 'function') {
      const result = getConnectedClients();
      console.log('✅ Function call successful:', result);
    } else {
      console.log('❌ getConnectedClients is not a function');
    }
  } catch (error) {
    console.log('❌ Import failed:', error.message);
    console.log('Error stack:', error.stack);
  }
}

testImport().catch(error => {
  console.log('❌ Test failed:', error.message);
}).finally(() => {
  process.exit(0);
});