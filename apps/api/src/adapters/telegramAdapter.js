/**
 * Telegram Adapter - Telegram webhook integration with pluggable architecture
 */

import { createServer } from "http";

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
    if (!this.config.botToken) {
      throw new Error("Telegram bot token is required");
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
   * Call chat API with agent and message
   */
  async callChatApi(agentId, message) {
    try {
      const apiUrl = `http://localhost:4000/api/agents/${encodeURIComponent(agentId)}/chat`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Zsiistant-Telegram-Adapter'
        },
        body: JSON.stringify({
          message: message,
          stream: false // Get immediate response for Telegram
        })
      });
      
      if (!response.ok) {
        throw new Error(`Chat API request failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      return result;
      
    } catch (error) {
      console.error('Error calling chat API:', error);
      throw error;
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
      console.log(`🎯 Forwarding message to agent ${agentId}: ${messageContent}`);
      
      // Call the chat API to get response from agent
      const chatResponse = await this.callChatApi(agentId, messageContent);
      
      // Format the response for Telegram
      let responseContent = `🤖 <b>${agentId}</b> says:\n\n${chatResponse.message}`;
      
      // Add additional metadata if available
      if (chatResponse.tokensOut) {
        responseContent += `\n\n💭 *Tokens: ${chatResponse.tokensIn || 0} in, ${chatResponse.tokensOut} out*`;
      }
      
      if (chatResponse.duration) {
        responseContent += `\n⏱️ *Response time: ${chatResponse.duration}ms*`;
      }
      
      if (chatResponse.sessionId) {
        responseContent += `\n🔗 *Session: ${chatResponse.sessionId}*`;
      }
      
      // Send the response to Telegram
      await this.sendMessage(chatId, responseContent);
      
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
      
      // Switch to selected agent
      await this.switchToSelectedAgent(callbackQuery, agentId);
    } else if (callbackData === 'show_agents') {
      // Show agent selection menu
      await this.showAgentMenu(callbackQuery);
    }
  }

  /**
   * Switch to selected agent
   */
  async switchToSelectedAgent(callbackQuery, agentId) {
    try {
      const chatId = callbackQuery.message.chat.id;
      
      // Acknowledge the callback immediately
      await this.answerCallbackQuery(callbackQuery.id, {
        text: `🤖 Switched to ${agentId}`
      });
      
      // Update the message to show the selected agent
      const originalMessage = callbackQuery.message;
      const updatedText = `🤖 <b>Current Agent:</b> ${agentId}\n\nYou can now chat with this agent directly. Just send your message!`;
      
      // Edit the original message to show the selected agent
      await this.editMessageText(chatId, originalMessage.message_id, {
        text: updatedText,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🔄 Change Agent',
                callback_data: 'show_agents'
              }
            ]
          ]
        }
      });
      
      // Store the selected agent for this chat (in a real implementation, this would be persisted)
      if (!this.selectedAgents) {
        this.selectedAgents = new Map();
      }
      this.selectedAgents.set(chatId, agentId);
      
      console.log(`✅ Agent ${agentId} selected for chat ${chatId}`);
      
    } catch (error) {
      console.error('❌ Error switching to selected agent:', error);
      
      // Try to send an error message
      try {
        await this.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Error switching agent. Please try again.',
          show_alert: true
        });
      } catch (ackError) {
        console.error('Failed to acknowledge callback query:', ackError);
      }
    }
  }

  /**
   * Answer callback query
   */
  async answerCallbackQuery(callbackQueryId, options = {}) {
    const url = `https://api.telegram.org/bot${this.config.botToken}/answerCallbackQuery`;
    
    const payload = {
      callback_query_id: callbackQueryId,
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
   * Edit message text
   */
  async editMessageText(chatId, messageId, options = {}) {
    const url = `https://api.telegram.org/bot${this.config.botToken}/editMessageText`;
    
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: options.text,
      parse_mode: options.parse_mode || 'HTML',
      reply_markup: options.reply_markup
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
   * Show agent selection menu
   */
  async showAgentMenu(callbackQuery) {
    try {
      const chatId = callbackQuery.message.chat.id;
      
      // Get available agents (in a real implementation, this would fetch from the API)
      const availableAgents = [
        { id: 'general', name: 'General Assistant' },
        { id: 'coding', name: 'Code Helper' },
        { id: 'creative', name: 'Creative Writer' },
        { id: 'analysis', name: 'Data Analyst' }
      ];
      
      // Create inline keyboard with agent options
      const inlineKeyboard = {
        inline_keyboard: availableAgents.map(agent => ([
          {
            text: agent.name,
            callback_data: `agent_${agent.id}`
          }
        ]))
      };
      
      // Edit the message to show the agent selection menu
      const originalMessage = callbackQuery.message;
      const menuText = `🤖 <b>Select an Agent:</b>\n\nChoose which agent you'd like to chat with:`;
      
      await this.editMessageText(chatId, originalMessage.message_id, {
        text: menuText,
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard
      });
      
      console.log(`📋 Agent menu shown for chat ${chatId}`);
      
    } catch (error) {
      console.error('❌ Error showing agent menu:', error);
      
      // Try to send an error message
      try {
        await this.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Error showing agent menu. Please try again.',
          show_alert: true
        });
      } catch (ackError) {
        console.error('Failed to acknowledge callback query:', ackError);
      }
    }
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