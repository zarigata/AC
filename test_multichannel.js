#!/usr/bin/env node

/**
 * Test Multi-Channel Connectivity
 * Test Telegram and Discord webhook integration
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

// Test configuration
const API_BASE_URL = 'http://localhost:4000';
const TEST_WS_URL = 'ws://localhost:4000/ws';
const TELEGRAM_WEBHOOK_URL = `${API_BASE_URL}/api/webhooks/telegram`;
const DISCORD_WEBHOOK_URL = `${API_BASE_URL}/api/webhooks/discord`;

console.log('🔬 Multi-Channel Connectivity Test...');

async function testWebhookEndpoints() {
  console.log('\\n📋 Testing Webhook Endpoints');
  
  // Test webhook listing
  try {
    const response = await fetch(`${API_BASE_URL}/api/webhooks`);
    const webhooks = await response.json();
    console.log('✅ Webhook listing:', webhooks);
  } catch (error) {
    console.log('❌ Webhook listing failed:', error.message);
  }
  
  // Test webhook status
  try {
    const response = await fetch(`${API_BASE_URL}/api/webhooks/status`);
    const status = await response.json();
    console.log('✅ Webhook status:', status);
  } catch (error) {
    console.log('❌ Webhook status failed:', error.message);
  }
}

async function testTelegramWebhook() {
  console.log('\\n📋 Testing Telegram Webhook');
  
  const testTelegramUpdate = {
    update_id: 1,
    message: {
      message_id: 1,
      from: {
        id: 123456789,
        is_bot: false,
        first_name: 'Test User',
        username: 'testuser'
      },
      chat: {
        id: 123456789,
        first_name: 'Test User',
        username: 'testuser',
        type: 'private'
      },
      date: Math.floor(Date.now() / 1000),
      text: '/start',
      entities: [{ type: 'bot_command', offset: 0, length: 6 }]
    }
  };
  
  try {
    const response = await fetch(TELEGRAM_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testTelegramUpdate)
    });
    
    const result = await response.text();
    console.log('✅ Telegram webhook response:', result);
  } catch (error) {
    console.log('❌ Telegram webhook failed:', error.message);
  }
}

async function testDiscordWebhook() {
  console.log('\\n📋 Testing Discord Webhook');
  
  const testDiscordInteraction = {
    type: 1, // PING
    data: {
      name: 'chat',
      options: [
        {
          name: 'agent',
          type: 3,
          value: 'test-agent'
        },
        {
          name: 'message', 
          type: 3,
          value: 'Hello from Discord!'
        }
      ]
    },
    id: '123456789',
    application_id: '987654321',
    token: 'test-token',
    version: 1
  };
  
  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDiscordInteraction)
    });
    
    const result = await response.text();
    console.log('✅ Discord webhook response:', result);
  } catch (error) {
    console.log('❌ Discord webhook failed:', error.message);
  }
}

async function main() {
  await testWebhookEndpoints();
  await testTelegramWebhook(); 
  await testDiscordWebhook();
  
  console.log('\\n🏁 Multi-Channel Connectivity Test Completed');
}

main().catch(console.error);