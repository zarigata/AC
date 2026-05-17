/**
 * Discord Adapter - Discord webhook integration with pluggable architecture
 */

import { createServer } from "node:http";
import { createProvider } from "./ollama.js";
import { AgentRegistry } from "../registry.js";

// Create a global registry instance (this should be passed in from server.js)
const registry = new AgentRegistry();

export class DiscordAdapter {
  constructor(config = {}) {
    this.config = {
      botToken: config.botToken || process.env.DISCORD_BOT_TOKEN,
      webhookUrl: config.webhookUrl || process.env.DISCORD_WEBHOOK_URL,
      serverId: config.serverId || process.env.DISCORD_SERVER_ID,
      commands: config.commands || [
        {
          name: "chat",
          description: "Chat with an agent",
          options: [
            {
              name: "agent",
              description: "Select an agent to chat with",
              type: 3, // STRING
              required: true
            },
            {
              name: "message",
              description: "Your message",
              type: 3, // STRING
              required: true
            }
          ]
        }
      ],
      ...config
    };
    
    this.isActive = false;
    this.webhookServer = null;
    this.applicationCommands = [];
  }

  /**
   * Initialize the Discord adapter
   */
  async initialize() {
    // Allow demo mode for testing
    if (this.config.isDemo) {
      console.log("🎮 Initializing demo Discord adapter...");
      this.isActive = true;
      return;
    }
    
    if (!this.config.botToken || this.config.botToken === 'demo-token') {
      console.log("🎮 Discord adapter running in demo mode (no real bot token)");
      this.isActive = true;
      return;
    }

    console.log("🎮 Initializing Discord adapter...");
    this.isActive = true;
    
    // Initialize webhook server if webhook URL is provided
    if (this.config.webhookUrl) {
      await this.setupWebhookServer();
    }
    
    // Register slash commands if server ID is provided
    if (this.config.serverId) {
      await this.registerCommands();
    }
  }

  /**
   * Set up webhook server for receiving Discord interactions
   */
  async setupWebhookServer() {
    this.webhookServer = createServer(async (req, res) => {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const interaction = JSON.parse(body);
          await this.handleInteraction(interaction);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ type: 1 })); // ACK response
        } catch (error) {
          console.error('Discord webhook error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Webhook processing failed' }));
        }
      });
    });

    // Start webhook server on a port (configurable)
    const webhookPort = process.env.DISCORD_WEBHOOK_PORT || 3002;
    
    this.webhookServer.listen(webhookPort, () => {
      console.log(`📡 Discord webhook server listening on port ${webhookPort}`);
    });
  }

  /**
   * Register slash commands with Discord
   */
  async registerCommands() {
    try {
      const commands = this.config.commands;
      
      // Global commands (no server ID needed)
      const globalCommands = commands.filter(cmd => !cmd.guildOnly);
      if (globalCommands.length > 0) {
        await this.bulkRegisterCommands(globalCommands);
      }
      
      // Server-specific commands
      if (this.config.serverId) {
        const serverCommands = commands.filter(cmd => cmd.guildOnly);
        if (serverCommands.length > 0) {
          await this.bulkRegisterCommands(serverCommands, this.config.serverId);
        }
      }
      
      console.log(`✅ Registered ${commands.length} Discord commands`);
      
    } catch (error) {
      console.error('Error registering Discord commands:', error);
      throw error;
    }
  }

  /**
   * Bulk register commands with Discord API
   */
  async bulkRegisterCommands(commands, guildId) {
    const url = guildId 
      ? `https://discord.com/api/v10/applications/${this.config.botClientId || process.env.DISCORD_CLIENT_ID}/guilds/${guildId}/commands`
      : `https://discord.com/api/v10/applications/${this.config.botClientId || process.env.DISCORD_CLIENT_ID}/commands`;
    
    const options = {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${this.config.botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands)
    };

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`Failed to register commands: ${response.statusText}`);
    }
    
    this.applicationCommands = commands;
  }

  /**
   * Handle Discord interactions (slash commands, buttons, etc.)
   */
  async handleInteraction(interaction) {
    if (!this.isActive) return;

    console.log('🎭 Received Discord interaction:', JSON.stringify(interaction, null, 2));

    const { type, data, member, id } = interaction;

    // Handle different interaction types
    switch (type) {
      case 1: // PING
        // Already handled by the webhook server
        break;
        
      case 2: // APPLICATION_COMMAND
        await this.handleSlashCommand(interaction);
        break;
        
      case 3: // MESSAGE_COMPONENT
        await this.handleComponentInteraction(interaction);
        break;
        
      default:
        console.log(`❓ Unknown interaction type: ${type}`);
    }
  }

  /**
   * Handle slash commands
   */
  async handleSlashCommand(interaction) {
    const { commandName, options } = interaction.data;
    const userId = interaction.member.user.id;
    const channelId = interaction.channel_id;
    
    console.log(`⚡ Slash command ${commandName} from ${userId}`);
    
    switch (commandName) {
      case 'chat':
        const agentId = options.find(opt => opt.name === 'agent')?.value;
        const message = options.find(opt => opt.name === 'message')?.value;
        
        if (agentId && message) {
          await this.handleChatCommand(interaction, agentId, message);
        } else {
          await this.sendErrorResponse(interaction, "Missing required parameters");
        }
        break;
        
      default:
        await this.sendErrorResponse(interaction, `Unknown command: ${commandName}`);
    }
  }

  /**
   * Handle chat command
   */
  async handleChatCommand(interaction, agentId, message) {
    try {
      console.log(`💬 Chat request - Agent: ${agentId}, Message: ${message}`);
      
      try {
        // Get agent from registry
        const agent = registry.getAgent(agentId);
        if (!agent) {
          throw new Error(`Agent ${agentId} not found`);
        }
        
        // Get or create session for this agent
        let sessions = registry.listSessions(agentId);
        let session;
        
        if (sessions.sessions.length > 0) {
          session = sessions.sessions[0];
        } else {
          session = registry.createSession(agentId, {
            title: message.slice(0, 50) + (message.length > 50 ? '...' : '')
          });
        }
        
        // Save user message
        registry.createMessage(agentId, session.id, {
          role: 'user',
          content: message.trim(),
          tokensIn: 0
        });
        
        // Get context window
        const { MemoryManager } = await import('../memory/memoryManager.js');
        const memoryManager = new MemoryManager(registry);
        const contextWindow = await memoryManager.getCompleteContext(agentId, session.id);
        
        // Add system prompt if defined
        if (agent.systemPrompt && agent.systemPrompt.trim()) {
          contextWindow.unshift({
            role: 'system',
            content: agent.systemPrompt.trim()
          });
        }
        
        // Add user message to context
        const userMessage = {
          role: 'user',
          content: message.trim(),
          timestamp: new Date().toISOString()
        };
        contextWindow.push(userMessage);
        
        // Create provider and get response
        const provider = createProvider(agent.provider?.toLowerCase()) || createProvider('ollama');
        if (!provider) {
          throw new Error(`Provider ${agent.provider} not available`);
        }
        
        // Generate response
        const result = await provider.chat(contextWindow, { 
          model: agent.model, 
          temperature: 0.7, 
          maxTokens: 512 
        });
        
        // Save assistant response
        registry.createMessage(agentId, session.id, {
          role: 'assistant',
          content: result.content,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          model: result.model
        });
        
        // Add assistant response to context
        const assistantMessage = {
          role: 'assistant',
          content: result.content,
          timestamp: new Date().toISOString()
        };
        await memoryManager.addMessageToContext(agentId, session.id, assistantMessage);
        
        // Send the actual response
        await this.sendInteractionResponse(interaction, {
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: {
            content: `🤖 **${agent.name}**\n\n${result.content}\n\n*Tokens: ${result.tokensIn + result.tokensOut}*`
          }
      });
      
    } catch (error) {
      console.error('Error handling chat command:', error);
      await this.sendErrorResponse(interaction, "Sorry, I encountered an error processing your request.");
    }
      await this.sendInteractionResponse(interaction, {
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: {
          content: `🤖 Chat with agent "${agentId}" received: "${message}"\n\n*Integration with chat system coming soon!*`
        }
      });
      
    } catch (error) {
      console.error('Error handling chat command:', error);
      await this.sendErrorResponse(interaction, "Sorry, I encountered an error processing your request.");
    }
  }

  /**
   * Handle component interactions (buttons, select menus, etc.)
   */
  async handleComponentInteraction(interaction) {
    const { custom_id, component_type } = interaction.data;
    
    console.log(`🎛️ Component interaction - ID: ${custom_id}, Type: ${component_type}`);
    
    // Handle different component types
    switch (component_type) {
      case 2: // BUTTON
        await this.handleButtonClick(interaction);
        break;
        
      case 3: // SELECT_MENU
        await this.handleSelectMenu(interaction);
        break;
        
      default:
        console.log(`❓ Unknown component type: ${component_type}`);
    }
  }

  /**
   * Handle button clicks
   */
  async handleButtonClick(interaction) {
    const customId = interaction.data.custom_id;
    
    if (customId.startsWith('agent_')) {
      const agentId = customId.replace('agent_', '');
      console.log(`🤖 User selected agent: ${agentId}`);
      
      // Acknowledge the button click
      await this.sendInteractionResponse(interaction, {
        type: 6 // ACK_BUTTON
      });
    }
  }

  /**
   * Handle select menu interactions
   */
  async handleSelectMenu(interaction) {
    const values = interaction.data.values;
    console.log(`📋 Select menu values: ${values.join(', ')}`);
    
    // Acknowledge the selection
    await this.sendInteractionResponse(interaction, {
      type: 6 // ACK_BUTTON
    });
  }

  /**
   * Send interaction response
   */
  async sendInteractionResponse(interaction, response) {
    const url = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`;
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(response)
    };

    const result = await fetch(url, options);
    if (!result.ok) {
      console.error('Failed to send interaction response:', result.statusText);
    }
  }

  /**
   * Send error response to interaction
   */
  async sendErrorResponse(interaction, errorMessage) {
    await this.sendInteractionResponse(interaction, {
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        content: `❌ ${errorMessage}`,
        flags: 64 // EPHEMERAL
      }
    });
  }

  /**
   * Send follow-up message
   */
  async sendFollowUpMessage(interactionToken, content, options = {}) {
    const url = `https://discord.com/api/v10/webhooks/${this.config.botClientId || process.env.DISCORD_CLIENT_ID}/${interactionToken}`;
    
    const payload = {
      content: content,
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
      throw new Error(`Failed to send follow-up message: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get bot user info
   */
  async getBotUser() {
    const url = `https://discord.com/api/v10/users/@me`;
    
    const options = {
      headers: {
        'Authorization': `Bot ${this.config.botToken}`
      }
    };

    const response = await fetch(url, options);
    return response.json();
  }

  /**
   * Get guild information
   */
  async getGuild(guildId) {
    const url = `https://discord.com/api/v10/guilds/${guildId}`;
    
    const options = {
      headers: {
        'Authorization': `Bot ${this.config.botToken}`
      }
    };

    const response = await fetch(url, options);
    return response.json();
  }

  /**
   * Shutdown the adapter
   */
  async shutdown() {
    console.log("🔄 Shutting down Discord adapter...");
    this.isActive = false;
    
    if (this.webhookServer) {
      this.webhookServer.close();
    }
    
    // Clean up commands if needed
    // TODO: Implement command cleanup
    
    console.log("✅ Discord adapter shut down");
  }
}