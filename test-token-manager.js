#!/usr/bin/env node

/**
 * Test script for TokenManager functionality
 */

import { AgentRegistry } from './apps/api/src/registry.js';
import TokenManager from './apps/api/src/token/tokenManager.js';

async function testTokenManager() {
  try {
    console.log('🧪 Testing TokenManager...');
    
    // Initialize registry
    const databasePath = new URL('./data/test-tokens.sqlite', import.meta.url).pathname;
    console.log('📁 Database path:', databasePath);
    
    const registry = new AgentRegistry({ databasePath });
    
    // Initialize token manager
    const tokenManager = new TokenManager(registry);
    
    console.log('✅ TokenManager initialized successfully');
    
    // Test pricing information
    console.log('\n💰 Testing pricing information...');
    const pricing = tokenManager.getModelPricing('qwen3:1.7b');
    console.log('Qwen pricing:', pricing);
    
    const cost = tokenManager.calculateCost(1000, 500, 'qwen3:1.7b');
    console.log('Cost for 1000 input, 500 output tokens:', cost);
    
    // Test token counting
    console.log('\n📝 Testing token counting...');
    const testText = "Hello, this is a test message to count tokens.";
    const tokenCount = tokenManager.countTokens(testText);
    console.log(`Text: "${testText}"`);
    console.log(`Token count: ${tokenCount}`);
    
    // Test processing a message
    console.log('\n💬 Testing message processing...');
    
    // First create a session for testing
    const testSession = registry.createSession(agent.id, {
      title: 'Test Session for Message Processing',
      model: 'qwen3:1.7b'
    });
    
    // Create message in database first
    const dbMessage = registry.createMessage(agent.id, testSession.id, {
      role: 'user',
      content: 'Hello world, this is a test message for token tracking.',
      tokensIn: 0,
      tokensOut: 0
    });
    
    const message = {
      id: dbMessage.id,
      sessionId: testSession.id,
      role: 'user',
      content: 'Hello world, this is a test message for token tracking.',
      model: 'qwen3:1.7b'
    };
    
    const processed = await tokenManager.processMessage(message);
    console.log('Processed message:', {
      id: processed.id,
      role: processed.role,
      tokensIn: processed.tokensIn,
      tokensOut: processed.tokensOut,
      cost: processed.cost
    });
    
    // Test session usage calculation
    console.log('\n📊 Testing session usage...');
    const sessionUsage = await tokenManager.getSessionUsage(testSession.id);
    console.log('Session usage:', sessionUsage);
    
    // Test agent usage calculation
    console.log('\n🤖 Testing agent usage...');
    
    // Create a test agent first
    const agent = registry.createAgent({
      name: 'Test Agent',
      purpose: 'Testing token tracking functionality',
      provider: 'ollama',
      model: 'qwen3:1.7b',
      isolationMode: 'isolated',
      maxConcurrentTasks: 4,
      peerAccess: false
    });
    
    console.log('Created test agent:', agent);
    
    // Create a test session for the agent
    const session = registry.createSession(agent.id, {
      title: 'Test Chat Session',
      model: 'qwen3:1.7b'
    });
    
    console.log('Created test session:', session);
    
    // Create some test messages
    const userMessage = registry.createMessage(agent.id, session.id, {
      role: 'user',
      content: 'Hello, can you help me with a coding problem?',
      tokensIn: 12,
      tokensOut: 0
    });
    
    const assistantMessage = registry.createMessage(agent.id, session.id, {
      role: 'assistant',
      content: 'Sure! I would be happy to help you with your coding problem. Could you please tell me more about what you are trying to accomplish?',
      tokensIn: 5,
      tokensOut: 25
    });
    
    console.log('Created test messages:', { userMessage, assistantMessage });
    
    // Test agent usage
    const agentUsage = await tokenManager.getAgentUsage(agent.id);
    console.log('Agent usage statistics:', agentUsage);
    
    console.log('\n✅ All TokenManager tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testTokenManager().catch(console.error);