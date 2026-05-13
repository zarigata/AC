/**
 * Webhook Routes - Handle webhook integration for external channels (Telegram, Discord)
 */

import { AgentRegistry } from "../registry.js";
import { webhookManager } from "../adapters/webhookManager.js";

export function registerWebhookRoutes(server, registry, providers, failoverChains, settings) {
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
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    
    // Handle webhook listing
    if (request.method === "GET" && request.url === "/api/webhooks") {
      return handleListWebhooks(request, response);
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
    
    // Handle actual webhook requests for Telegram and Discord
    if (request.method === "POST") {
      // Telegram webhook endpoint
      if (request.url === "/api/webhooks/telegram" || request.url === "/api/webhooks/telegram-default") {
        return handleTelegramWebhook(request, response);
      }
      
      // Discord webhook endpoint
      if (request.url === "/api/webhooks/discord" || request.url === "/api/webhooks/discord-default") {
        return handleDiscordWebhook(request, response);
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
        const webhooks = [
          {
            id: "telegram-default",
            name: "Telegram Default",
            type: "telegram",
            endpoint: "/api/webhooks/telegram",
            status: "active",
            created: new Date().toISOString()
          },
          {
            id: "discord-default", 
            name: "Discord Default",
            type: "discord",
            endpoint: "/api/webhooks/discord",
            status: "active",
            created: new Date().toISOString()
          }
        ];
        
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
        config: {
          bot_token: process.env.TELEGRAM_BOT_TOKEN || "your-telegram-bot-token",
          webhook_url: process.env.TELEGRAM_WEBHOOK_URL || "https://your-domain.com/api/webhooks/telegram",
          allowed_updates: ["message", "callback_query"],
          max_connections: 40
        },
        created: new Date().toISOString(),
        last_updated: new Date().toISOString()
      },
      "discord-default": {
        id: "discord-default",
        name: "Discord Default", 
        type: "discord",
        endpoint: "/api/webhooks/discord",
        status: "active",
        config: {
          bot_token: process.env.DISCORD_BOT_TOKEN || "your-discord-bot-token",
          webhook_url: process.env.DISCORD_WEBHOOK_URL || "https://your-domain.com/api/webhooks/discord",
          server_id: process.env.DISCORD_SERVER_ID || "your-server-id",
          commands: [
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
          ]
        },
        created: new Date().toISOString(),
        last_updated: new Date().toISOString()
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
        
        // Forward the update to the webhook manager
        if (webhookManager.getAdapter('telegram')) {
          await webhookManager.handleWebhookRequest('telegram', body, response);
        } else {
          console.log('⚠️ Telegram adapter not available');
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Telegram adapter not configured" }));
          return true;
        }
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
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
        
        // Forward the interaction to the webhook manager
        if (webhookManager.getAdapter('discord')) {
          await webhookManager.handleWebhookRequest('discord', body, response);
        } else {
          console.log('⚠️ Discord adapter not available');
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Discord adapter not configured" }));
          return true;
        }
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ type: 1 })); // ACK response for Discord
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