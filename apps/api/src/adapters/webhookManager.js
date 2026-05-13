/**
 * Webhook Manager - Central management for all webhook adapters
 */

import { TelegramAdapter } from "./telegramAdapter.js";
import { DiscordAdapter } from "./discordAdapter.js";

export class WebhookManager {
  constructor(config = {}) {
    this.config = config;
    this.adapters = new Map();
    this.isActive = false;
    
    // Initialize adapters based on configuration
    this.initializeAdapters();
  }

  /**
   * Initialize adapters based on environment configuration
   */
  initializeAdapters() {
    // Initialize Telegram adapter if configured
    if (process.env.TELEGRAM_BOT_TOKEN) {
      const telegramConfig = {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
        allowedUpdates: process.env.TELEGRAM_ALLOWED_UPDATES?.split(',') || ["message", "callback_query"],
        maxConnections: parseInt(process.env.TELEGRAM_MAX_CONNECTIONS) || 40
      };
      
      const telegramAdapter = new TelegramAdapter(telegramConfig);
      this.adapters.set('telegram', telegramAdapter);
    }

    // Initialize Discord adapter if configured
    if (process.env.DISCORD_BOT_TOKEN) {
      const discordConfig = {
        botToken: process.env.DISCORD_BOT_TOKEN,
        webhookUrl: process.env.DISCORD_WEBHOOK_URL,
        serverId: process.env.DISCORD_SERVER_ID,
        clientId: process.env.DISCORD_CLIENT_ID,
        commands: this.parseDiscordCommands(process.env.DISCORD_COMMANDS)
      };
      
      const discordAdapter = new DiscordAdapter(discordConfig);
      this.adapters.set('discord', discordAdapter);
    }
  }

  /**
   * Parse Discord commands from environment variable
   */
  parseDiscordCommands(commandsEnv) {
    if (!commandsEnv) {
      return [
        {
          name: "chat",
          description: "Chat with an agent",
          options: [
            {
              name: "agent",
              description: "Select an agent to chat with",
              type: 3,
              required: true
            },
            {
              name: "message",
              description: "Your message",
              type: 3,
              required: true
            }
          ]
        }
      ];
    }

    try {
      return JSON.parse(commandsEnv);
    } catch (error) {
      console.error('Failed to parse Discord commands from environment, using defaults:', error);
      return [
        {
          name: "chat",
          description: "Chat with an agent", 
          options: [
            {
              name: "agent",
              description: "Select an agent to chat with",
              type: 3,
              required: true
            },
            {
              name: "message",
              description: "Your message",
              type: 3,
              required: true
            }
          ]
        }
      ];
    }
  }

  /**
   * Start all adapters
   */
  async start() {
    if (this.isActive) {
      console.log("⚠️ Webhook manager is already active");
      return;
    }

    console.log("🚀 Starting webhook manager...");
    
    const startPromises = [];
    
    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.initialize();
        startPromises.push(adapter.initialize());
        console.log(`✅ ${name} adapter initialized successfully`);
      } catch (error) {
        console.error(`❌ Failed to initialize ${name} adapter:`, error);
        // Don't throw, continue with other adapters
      }
    }

    await Promise.all(startPromises);
    this.isActive = true;
    
    console.log(`🎉 Webhook manager started with ${this.adapters.size} adapters`);
  }

  /**
   * Stop all adapters
   */
  async stop() {
    if (!this.isActive) {
      console.log("⚠️ Webhook manager is not active");
      return;
    }

    console.log("🛑 Stopping webhook manager...");
    
    const stopPromises = [];
    
    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.shutdown();
        stopPromises.push(adapter.shutdown());
        console.log(`✅ ${name} adapter shut down successfully`);
      } catch (error) {
        console.error(`❌ Failed to shut down ${name} adapter:`, error);
        // Don't throw, continue with other adapters
      }
    }

    await Promise.all(stopPromises);
    this.isActive = false;
    
    console.log("✅ Webhook manager stopped");
  }

  /**
   * Get adapter by name
   */
  getAdapter(name) {
    return this.adapters.get(name);
  }

  /**
   * Get all active adapters
   */
  getAdapters() {
    return Array.from(this.adapters.entries());
  }

  /**
   * Get adapter status
   */
  getStatus() {
    const status = {
      isActive: this.isActive,
      adapters: {},
      totalAdapters: this.adapters.size
    };

    for (const [name, adapter] of this.adapters) {
      status.adapters[name] = {
        isActive: adapter.isActive || false,
        type: adapter.constructor.name,
        config: adapter.config
      };
    }

    return status;
  }

  /**
   * Set webhook for specific adapter
   */
  async setWebhook(adapterName, webhookUrl) {
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter ${adapterName} not found`);
    }

    if (adapterName === 'telegram') {
      return await adapter.setWebhook();
    } else if (adapterName === 'discord') {
      // Discord doesn't need webhook setting in the same way
      console.log('🔗 Discord webhook handled by interaction endpoint');
      return { success: true };
    } else {
      throw new Error(`Webhook setting not supported for ${adapterName}`);
    }
  }

  /**
   * Delete webhook for specific adapter
   */
  async deleteWebhook(adapterName) {
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter ${adapterName} not found`);
    }

    if (adapterName === 'telegram') {
      return await adapter.deleteWebhook();
    } else if (adapterName === 'discord') {
      // Discord doesn't have a concept of deleting webhooks like Telegram
      console.log('🔗 Discord webhooks handled by interaction endpoints');
      return { success: true };
    } else {
      throw new Error(`Webhook deletion not supported for ${adapterName}`);
    }
  }

  /**
   * Get webhook info for specific adapter
   */
  async getWebhookInfo(adapterName) {
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter ${adapterName} not found`);
    }

    if (adapterName === 'telegram') {
      return await adapter.getWebhookInfo();
    } else if (adapterName === 'discord') {
      return await adapter.getBotUser();
    } else {
      throw new Error(`Webhook info not available for ${adapterName}`);
    }
  }

  /**
   * Forward message to chat system (placeholder for integration)
   */
  async forwardToChatSystem(agentId, message, source, metadata = {}) {
    console.log(`📨 Forwarding message from ${source} to agent ${agentId}: ${message}`);
    
    try {
      // Import chat functionality dynamically to avoid circular dependencies
      const { chatWithAgent } = await import('../chat.js');
      
      // Forward message to chat system
      const chatResponse = await chatWithAgent(agentId, message, metadata.chatId || source, {
        source: source,
        webhook: true,
        ...metadata
      });
      
      return {
        success: true,
        message: `Message forwarded to agent ${agentId}`,
        response: chatResponse.content || chatResponse
      };
    } catch (error) {
      console.error('Error forwarding to chat system:', error);
      return {
        success: false,
        message: 'Failed to forward message',
        error: error.message,
        response: `Sorry, I encountered an error processing your message.`
      };
    }
  }

  /**
   * Send response back to source channel
   */
  async sendResponseToSource(source, response, metadata = {}) {
    console.log(`📤 Sending response to ${source}: ${response}`);
    
    try {
      const adapter = this.adapters.get(source);
      if (!adapter) {
        throw new Error(`Adapter ${source} not found`);
      }
      
      let sendResult;
      
      if (source === 'telegram') {
        // Send response via Telegram
        sendResult = await adapter.sendMessage(
          metadata.chatId || metadata.telegramChatId,
          response,
          { parse_mode: 'HTML' }
        );
      } else if (source === 'discord') {
        // Send response via Discord
        if (metadata.interactionToken) {
          // Send follow-up message for interactions
          sendResult = await adapter.sendFollowUpMessage(
            metadata.interactionToken,
            response
          );
        } else {
          // Send regular message
          sendResult = await adapter.sendInteractionResponse(
            metadata.interaction || {
              id: metadata.discordId,
              token: metadata.discordToken
            },
            {
              type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
              data: {
                content: response,
                flags: 0
              }
            }
          );
        }
      } else {
        throw new Error(`Response sending not supported for ${source}`);
      }
      
      return {
        success: true,
        message: 'Response sent to source channel',
        result: sendResult
      };
    } catch (error) {
      console.error('Error sending response to source:', error);
      return {
        success: false,
        message: 'Failed to send response',
        error: error.message
      };
    }
  }

  /**
   * Handle webhook request proxy (for external webhook URLs)
   */
  async handleWebhookRequest(source, request, response) {
    const adapter = this.adapters.get(source);
    if (!adapter) {
      throw new Error(`Adapter ${source} not found`);
    }

    // Forward the request to the appropriate adapter
    return await adapter.handleUpdate(request);
  }
}

// Export singleton instance
export const webhookManager = new WebhookManager();