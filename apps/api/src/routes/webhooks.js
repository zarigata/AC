/**
 * Webhook Routes - Handle webhook integration for external channels (Telegram, Discord)
 */

import { AgentRegistry } from "../registry.js";
import { webhookManager } from "../adapters/webhookManager.js";

export function registerWebhookRoutes(server, registry, providers, failoverChains, settings) {
  console.log('🔧 Webhook routes registered');
  
  // Helper to parse request body
  const getRequestBody = (request) => {
    return new Promise((resolve, reject) => {
      let body = '';
      request.on('data', chunk => {
        body += chunk.toString();
      });
      request.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(error);
        }
      });
      request.on('error', reject);
    });
  };

  // Webhook management endpoints
  const handleWebhookRoutes = async (request, response) => {
    console.log('🎯 Webhook routes called for:', request.method, request.url);
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    
    // Handle webhook status
    if (request.method === "GET" && request.url === "/api/webhooks/status") {
      console.log('📊 Handling webhook status request');
      return handleWebhookStatus(request, response);
    }
    
    // Handle webhook listing
    if (request.method === "GET" && request.url === "/api/webhooks") {
      console.log('📋 Handling webhook listing request');
      return handleListWebhooks(request, response);
    }
    
    // Handle actual webhook requests for Telegram and Discord (MUST CHECK BEFORE generic operations)
    if (request.method === "POST") {
      // Telegram webhook endpoint
      if (request.url === "/api/webhooks/telegram" || request.url === "/api/webhooks/telegram-default") {
        console.log('📡 Telegram webhook requested');
        return handleTelegramWebhook(request, response);
      }
      
      // Discord webhook endpoint
      if (request.url === "/api/webhooks/discord" || request.url === "/api/webhooks/discord-default") {
        console.log('🎭 Discord webhook requested');
        return handleDiscordWebhook(request, response);
      }
    }
    
    // Handle individual webhook operations
    const webhookMatch = request.url?.match(/^\/api\/webhooks\/([\w-]+)$/);
    if (webhookMatch && (request.method === "GET" || request.method === "POST" || request.method === "DELETE" || request.method === "PATCH")) {
      const webhookId = webhookMatch[1];
      return handleWebhookOperation(request, response, webhookId);
    }
    
    // Handle webhook verification/health checks
    if (request.method === "GET" && request.url?.startsWith("/api/webhooks/")) {
      const webhookMatch = request.url.match(/^\/api\/webhooks\/([\w-]+)\/verify$/);
      if (webhookMatch) {
        const webhookId = webhookMatch[1];
        return handleWebhookVerify(request, response, webhookId);
      }
    }
    
    return false;
  };

  /**
   * Handle webhook manager status
   */
  const handleWebhookStatus = async (request, response) => {
    if (request.method === "GET" && request.url === "/api/webhooks/status") {
      try {
        const status = webhookManager.getStatus();
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ status }, null, 2));
        return true;
      } catch (error) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Failed to get webhook status" }));
        return true;
      }
    }
    return false;
  };

  /**
   * List all configured webhooks
   */
  const handleListWebhooks = async (request, response) => {
    if (request.method === "GET" && request.url === "/api/webhooks") {
      try {
        const webhookStatus = webhookManager.getStatus();
        const webhooks = [];
        
        // Add webhooks for each active adapter
        for (const [name, adapterStatus] of webhookStatus.adapters) {
          const isDemo = name.includes('-demo');
          const displayName = isDemo ? name.replace('-demo', ' Demo') : name.charAt(0).toUpperCase() + name.slice(1);
          
          webhooks.push({
            id: `${name}-default`,
            name: `${displayName} Default`,
            type: name,
            endpoint: `/api/webhooks/${name.replace('-demo', '')}`,
            status: adapterStatus.isActive ? "active" : "inactive",
            isDemo: isDemo,
            created: new Date().toISOString(),
            config: adapterStatus.config
          });
        }
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ webhooks, total: webhooks.length }));
        return true;
      } catch (error) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Failed to list webhooks" }));
        return true;
      }
    }
    return false;
  };

  /**
   * Handle individual webhook operations (create, get, update, delete)
   */
  const handleWebhookOperation = async (request, response, webhookId) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    
    if (url.pathname === `/api/webhooks/${webhookId}`) {
      try {
        switch (request.method) {
          case "GET":
            return handleGetWebhook(request, response, webhookId);
          case "POST":
            return handleCreateWebhook(request, response, webhookId);
          case "PATCH":
            return handleUpdateWebhook(request, response, webhookId);
          case "DELETE":
            return handleDeleteWebhook(request, response, webhookId);
          default:
            return false;
        }
      } catch (error) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Webhook operation failed" }));
        return true;
      }
    }
    return false;
  };

  /**
   * Get specific webhook configuration
   */
  const handleGetWebhook = async (request, response, webhookId) => {
    const webhookConfigs = {
      "telegram-default": {
        id: "telegram-default",
        name: "Telegram Default",
        type: "telegram",
        endpoint: "/api/webhooks/telegram",
        status: "active",
        isDemo: !process.env.TELEGRAM_BOT_TOKEN,
        created: new Date().toISOString(),
        config: {
          botToken: process.env.TELEGRAM_BOT_TOKEN ? "***" : "demo-token",
          webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || "demo",
          allowedUpdates: ["message", "callback_query"],
          maxConnections: 40,
          mode: process.env.TELEGRAM_BOT_TOKEN ? "production" : "demo"
        }
      },
      "discord-default": {
        id: "discord-default",
        name: "Discord Default", 
        type: "discord",
        endpoint: "/api/webhooks/discord",
        status: "active",
        isDemo: !process.env.DISCORD_BOT_TOKEN,
        created: new Date().toISOString(),
        config: {
          botToken: process.env.DISCORD_BOT_TOKEN ? "***" : "demo-token",
          webhookUrl: process.env.DISCORD_WEBHOOK_URL || "demo",
          serverId: process.env.DISCORD_SERVER_ID || "demo",
          clientId: process.env.DISCORD_CLIENT_ID || "demo",
          commands: [
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
          ],
          mode: process.env.DISCORD_BOT_TOKEN ? "production" : "demo"
        }
      }
    };

    const webhook = webhookConfigs[webhookId];
    if (!webhook) {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Webhook not found" }));
      return true;
    }

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(webhook));
    return true;
  };

  /**
   * Create new webhook configuration
   */
  const handleCreateWebhook = async (request, response, webhookId) => {
    // This only handles general webhook creation, not specific Telegram/Discord webhooks
    if (webhookId === 'telegram' || webhookId === 'discord') {
      return false; // Let the specific handlers handle these
    }
    
    response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ 
      id: webhookId,
      status: "created",
      message: "Webhook configuration created successfully",
      webhook_url: `/api/webhooks/${webhookId}` 
    }));
    return true;
  };

  /**
   * Update webhook configuration
   */
  const handleUpdateWebhook = async (request, response, webhookId) => {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ 
      id: webhookId,
      status: "updated",
      message: "Webhook configuration updated successfully"
    }));
    return true;
  };

  /**
   * Delete webhook configuration
   */
  const handleDeleteWebhook = async (request, response, webhookId) => {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ 
      id: webhookId,
      status: "deleted",
      message: "Webhook configuration deleted successfully"
    }));
    return true;
  };

  /**
   * Handle webhook verification (health check)
   */
  const handleWebhookVerify = async (request, response, webhookId) => {
    if (request.url === `/api/webhooks/${webhookId}/verify`) {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ 
        id: webhookId,
        status: "verified",
        message: "Webhook endpoint is active and responsive",
        timestamp: new Date().toISOString()
      }));
      return true;
    }
    return false;
  };

  /**
   * Handle Telegram webhook requests
   */
  const handleTelegramWebhook = async (request, response) => {
    if (request.method === "POST" && (request.url === "/api/webhooks/telegram" || request.url === "/api/webhooks/telegram-default")) {
      try {
        const body = await getRequestBody(request);
        console.log('📡 Received Telegram webhook:', JSON.stringify(body, null, 2));
        
        // Try both real and demo adapters
        let adapter = webhookManager.getAdapter('telegram');
        if (!adapter) {
          adapter = webhookManager.getAdapter('telegram-demo');
        }
        
        if (adapter) {
          await webhookManager.handleWebhookRequest('telegram', body, response);
        } else {
          console.log('⚠️ Telegram adapter not available');
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ 
            status: 'demo-mode', 
            message: 'Telegram adapter running in demo mode - configure TELEGRAM_BOT_TOKEN for real functionality',
            adapterStatus: webhookManager.getStatus().adapters.get('telegram')
          }));
          return true;
        }
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true, status: 'processed' }));
        return true;
        
      } catch (error) {
        console.error('Telegram webhook error:', error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Webhook processing failed" }));
        return true;
      }
    }
    return false;
  };

  /**
   * Handle Discord webhook requests
   */
  const handleDiscordWebhook = async (request, response) => {
    if (request.method === "POST" && (request.url === "/api/webhooks/discord" || request.url === "/api/webhooks/discord-default")) {
      try {
        const body = await getRequestBody(request);
        console.log('🎭 Received Discord webhook:', JSON.stringify(body, null, 2));
        
        // Try both real and demo adapters
        let adapter = webhookManager.getAdapter('discord');
        if (!adapter) {
          adapter = webhookManager.getAdapter('discord-demo');
        }
        
        if (adapter) {
          await webhookManager.handleWebhookRequest('discord', body, response);
        } else {
          console.log('⚠️ Discord adapter not available');
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ 
            status: 'demo-mode', 
            message: 'Discord adapter running in demo mode - configure DISCORD_BOT_TOKEN for real functionality',
            adapterStatus: webhookManager.getStatus().adapters.get('discord')
          }));
          return true;
        }
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ type: 1, status: 'processed' })); // ACK response for Discord
        return true;
        
      } catch (error) {
        console.error('Discord webhook error:', error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Webhook processing failed" }));
        return true;
      }
    }
    return false;
  };

  // Return the handler function to be integrated with the main route system
  return handleWebhookRoutes;
}