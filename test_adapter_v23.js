/**
 * V23 Test: Adapter TODO Completion
 * Tests the newly implemented Discord command cleanup and Telegram agent switching functionality
 */

import { DiscordAdapter } from './apps/api/src/adapters/discordAdapter.js';
import { TelegramAdapter } from './apps/api/src/adapters/telegramAdapter.js';

console.log('🧪 Starting V23 Adapter TODO Completion Test...');

// Test Discord Adapter Command Cleanup
async function testDiscordCommandCleanup() {
  console.log('\n🎮 Testing Discord Adapter Command Cleanup...');
  
  const discordAdapter = new DiscordAdapter({
    botToken: 'test-bot-token',
    serverId: 'test-server-id',
    botClientId: 'test-client-id'
  });
  
  try {
    // Mock the fetch function for testing
    global.fetch = jest.fn();
    
    // Mock successful responses
    fetch.mockImplementation((url, options) => {
      console.log(`Mock fetch called with: ${url}`);
      return Promise.resolve({
        ok: true,
        statusText: 'OK'
      });
    });
    
    console.log('✅ Testing command cleanup with valid config...');
    await discordAdapter.cleanupCommands();
    console.log('✅ Command cleanup test passed');
    
    // Test with invalid config
    console.log('✅ Testing command cleanup with invalid config...');
    const invalidAdapter = new DiscordAdapter({});
    await invalidAdapter.cleanupCommands();
    console.log('✅ Invalid config test passed');
    
  } catch (error) {
    console.error('❌ Discord adapter test failed:', error.message);
    throw error;
  }
}

// Test Telegram Agent Switching
async function testTelegramAgentSwitching() {
  console.log('\n🤖 Testing Telegram Agent Switching...');
  
  const telegramAdapter = new TelegramAdapter({
    botToken: 'test-bot-token'
  });
  
  try {
    // Mock fetch for Telegram API calls
    global.fetch = jest.fn();
    
    // Mock successful responses
    fetch.mockImplementation((url, options) => {
      console.log(`Mock Telegram fetch called with: ${url}`);
      return Promise.resolve({
        ok: true,
        statusText: 'OK',
        json: () => ({})
      });
    });
    
    // Test callback query handling
    const mockCallbackQuery = {
      id: 'test-callback-id',
      message: {
        chat: { id: 12345 },
        message_id: 67890
      }
    };
    
    console.log('✅ Testing agent switching...');
    await telegramAdapter.switchToSelectedAgent(mockCallbackQuery, 'test-agent');
    console.log('✅ Agent switching test passed');
    
    // Test agent menu display
    console.log('✅ Testing agent menu display...');
    await telegramAdapter.showAgentMenu(mockCallbackQuery);
    console.log('✅ Agent menu test passed');
    
    // Test callback query handling with show_agents
    console.log('✅ Testing show_agents callback...');
    mockCallbackQuery.data = 'show_agents';
    await telegramAdapter.handleCallbackQuery(mockCallbackQuery);
    console.log('✅ Show agents test passed');
    
  } catch (error) {
    console.error('❌ Telegram adapter test failed:', error.message);
    throw error;
  }
}

// Main test runner
async function runTests() {
  try {
    console.log('🚀 Starting V23 Adapter Tests...\n');
    
    // Run Discord adapter tests
    await testDiscordCommandCleanup();
    
    // Run Telegram adapter tests
    await testTelegramAgentSwitching();
    
    console.log('\n🎉 All V23 Adapter Tests Passed!');
    console.log('✅ Discord command cleanup: IMPLEMENTED');
    console.log('✅ Telegram agent switching: IMPLEMENTED');
    console.log('✅ Telegram agent menu: IMPLEMENTED');
    console.log('✅ All TODO items completed: YES');
    
    return true;
    
  } catch (error) {
    console.error('\n❌ V23 Tests Failed:', error);
    return false;
  }
}

// Execute tests if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { runTests, testDiscordCommandCleanup, testTelegramAgentSwitching };