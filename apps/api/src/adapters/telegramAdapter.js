/**
 * Telegram Adapter - Telegram webhook integration with pluggable architecture
 */

import { createServer } from "node:http";

export class TelegramAdapter {
  constructor(config = {}) {
    this.config = {
      botToken: config.botToken || process.env.TELEGRAM_BOT_TOKEN,
      webhookUrl: config.webhookUrl || process.env.TELEGRAM_WEBHOOK_URL,
      allowedUpdates: config.allowedUpdates || ["message", "callback_query"],
      maxConnections: config.maxConnections || 40,
      ...config
    };
    
    this.isActive = false;
    this.webhookServer = null;
  }

  /**
   * Initialize the Telegram adapter
   */
  async initialize() {
    // Allow demo mode for testing
    if (this.config.isDemo) {
      console.log("🤖 Initializing demo Telegram adapter...");
      this.isActive = true;
      return;
    }
    
    if (!this.config.botToken || this.config.botToken === 'demo-token') {
      console.log("🤖 Telegram adapter running in demo mode (no real bot token)");
      this.isActive = true;
      return;
    }

    console.log("🤖 Initializing Telegram adapter...");
    this.isActive = true;
    
    // Initialize webhook server if webhook URL is provided
    if (this.config.webhookUrl) {
      await this.setupWebhookServer();
    }
  }

  /**
   * Set up webhook server for receiving Telegram updates
   */
  async setupWebhookServer() {
    this.webhookServer = createServer(async (req, res) => {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const update = JSON.parse(body);
          await this.handleUpdate(update);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          console.error('Telegram webhook error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Webhook processing failed' }));
        }
      });
    });

    // Start webhook server on a port (configurable)
    const webhookPort = process.env.TELEGRAM_WEBHOOK_PORT || 3001;
    
    this.webhookServer.listen(webhookPort, () => {
      console.log(`📡 Telegram webhook server listening on port ${webhookPort}`);
    });
  }

  /**
   * Handle incoming Telegram updates
   */
  async handleUpdate(update) {
    if (!this.isActive) return;

    console.log('📩 Received Telegram update:', JSON.stringify(update, null, 2));

    // Handle different types of updates
    if (update.message) {
      await this.handleMessage(update.message);
    } else if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
    }
  }

  /**
   * Handle incoming messages
   */
  async handleMessage(message) {
    const chatId = message.chat.id;
    const text = message.text;
    
    if (!text) {
      console.log('📨 Received non-text message, ignoring');
      return;
    }

    console.log(`💬 Message from ${chatId}: ${text}`);
    
    // Extract agent ID from message (format: @agent_name message)
    const agentMatch = text.match(/^@(\w+)\s+(.+)$/);
    let agentId, messageContent;
    
    if (agentMatch) {
      agentId = agentMatch[1];
      messageContent = agentMatch[2];
    } else {
      // Default to a configured agent or prompt user to specify
      agentId = process.env.DEFAULT_TELEGRAM_AGENT || 'general';
      messageContent = text;
    }

    // Forward message to chat system
    try {
      // This would integrate with the existing chat system
      // For now, just log and acknowledge
      console.log(`🎯 Forwarding message to agent ${agentId}: ${messageContent}`);
      
      // TODO: Integrate with chat system
      // const response = await chatWithAgent(agentId, messageContent, chatId);
      // await this.sendMessage(chatId, response);
      
    } catch (error) {
      console.error('Error handling message:', error);
      await this.sendError(chatId, "Sorry, I encountered an error processing your message.");
    }
  }

  /**
   * Handle callback queries (inline buttons)
   */
  async handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const callbackData = callbackQuery.data;
    
    console.log(`🎛️ Callback from ${chatId}: ${callbackData}`);
    
    // Handle different callback actions
    if (callbackData.startsWith('agent_')) {
      const agentId = callbackData.replace('agent_', '');
      console.log(`🤖 User selected agent: ${agentId}`);
      // TODO: Switch to selected agent
    }
  }

  /**
   * Send message to Telegram chat
   */
  async sendMessage(chatId, text, options = {}) {
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
    
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      ...options
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Send error message
   */
  async sendError(chatId, errorMessage) {
    return this.sendMessage(chatId, `❌ ${errorMessage}`);
  }

  /**
   * Set webhook for Telegram bot
   */
  async setWebhook() {
    if (!this.config.webhookUrl) {
      throw new Error("Webhook URL is required");
    }

    const url = `https://api.telegram.org/bot${this.config.botToken}/setWebhook`;
    
    const payload = {
      url: this.config.webhookUrl,
      allowed_updates: this.config.allowedUpdates,
      max_connections: this.config.maxConnections
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Failed to set webhook: ${response.statusText}`);
    }

    console.log('✅ Telegram webhook set successfully');
    return response.json();
  }

  /**
   * Remove webhook
   */
  async deleteWebhook() {
    const url = `https://api.telegram.org/bot${this.config.botToken}/deleteWebhook`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to delete webhook: ${response.statusText}`);
    }

    console.log('🗑️ Telegram webhook removed');
    return response.json();
  }

  /**
   * Get webhook info
   */
  async getWebhookInfo() {
    const url = `https://api.telegram.org/bot${this.config.botToken}/getWebhookInfo`;
    
    const response = await fetch(url);
    return response.json();
  }

  /**
   * Shutdown the adapter
   */
  async shutdown() {
    console.log("🔄 Shutting down Telegram adapter...");
    this.isActive = false;
    
    if (this.webhookServer) {
      this.webhookServer.close();
    }
    
    console.log("✅ Telegram adapter shut down");
  }
}