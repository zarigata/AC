/**
 * OpenAPI 3.0 Specification for Zsiistant API
 * Auto-generated API documentation
 */

const openapiSpec = {
  "openapi": "3.0.0",
  "info": {
    "title": "Zsiistant API",
    "description": "REST API for Zsiistant AI assistant service with provider failover, agent management, session persistence, token tracking, and comprehensive tool integration",
    "version": "1.0.0",
    "contact": {
      "name": "Zsiistant Team",
      "email": "support@zsiistant.com"
    },
    "license": {
      "name": "MIT",
      "url": "https://opensource.org/licenses/MIT"
    }
  },
  "servers": [
    {
      "url": "http://localhost:4000",
      "description": "Development server"
    }
  ],
  "components": {
    "schemas": {
      "HealthResponse": {
        "type": "object",
        "properties": {
          "ok": { "type": "boolean", "description": "Service health status" },
          "service": { "type": "string", "description": "Service name" },
          "version": { "type": "string", "description": "API version" },
          "uptime": { "type": "number", "description": "Server uptime in milliseconds" }
        },
        "required": ["ok", "service", "version", "uptime"]
      },
      "ChatMessage": {
        "type": "object",
        "properties": {
          "message": { "type": "string", "description": "User message content" },
          "agentId": { "type": "string", "description": "Target agent ID" },
          "stream": { "type": "boolean", "default": false, "description": "Enable streaming response" }
        },
        "required": ["message", "agentId"]
      },
      "ChatResponse": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Response ID" },
          "content": { "type": "string", "description": "AI response content" },
          "agentId": { "type": "string", "description": "Agent that generated the response" },
          "timestamp": { "type": "string", "format": "date-time", "description": "Response timestamp" }
        },
        "required": ["id", "content", "agentId", "timestamp"]
      },
      "Agent": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Unique agent identifier" },
          "name": { "type": "string", "description": "Agent display name" },
          "purpose": { "type": "string", "description": "Agent description/purpose" },
          "systemPrompt": { "type": ["string", "null"], "description": "System prompt for the agent" },
          "toolsConfig": { "type": ["object", "null"], "description": "Tool configuration" },
          "provider": { "type": "string", "description": "AI provider (ollama, openai, etc.)" },
          "model": { "type": "string", "description": "AI model to use" },
          "isolationMode": { "type": "string", "description": "Isolation configuration" },
          "status": { "type": "string", "description": "Current agent status" },
          "maxConcurrentTasks": { "type": "number", "description": "Maximum concurrent tasks" },
          "peerAccess": { "type": "boolean", "description": "Allow peer access" },
          "createdAt": { "type": "string", "format": "date-time", "description": "Creation timestamp" },
          "updatedAt": { "type": "string", "format": "date-time", "description": "Last update timestamp" }
        },
        "required": ["id", "name", "provider", "model", "status", "createdAt", "updatedAt"]
      },
      "CreateAgentRequest": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Agent display name" },
          "purpose": { "type": "string", "description": "Agent description/purpose" },
          "systemPrompt": { "type": ["string", "null"], "description": "System prompt for the agent" },
          "toolsConfig": { "type": ["object", "null"], "description": "Tool configuration" },
          "provider": { "type": "string", "description": "AI provider (ollama, openai, etc.)" },
          "model": { "type": "string", "description": "AI model to use" },
          "isolationMode": { "type": "string", "default": "isolated", "description": "Isolation configuration" },
          "maxConcurrentTasks": { "type": "number", "default": 2, "description": "Maximum concurrent tasks" },
          "peerAccess": { "type": "boolean", "default": false, "description": "Allow peer access" }
        },
        "required": ["name", "provider", "model"],
        "example": {
          "name": "Research Assistant",
          "purpose": "Help with research and analysis",
          "provider": "ollama",
          "model": "qwen3:1.7b",
          "maxConcurrentTasks": 3
        }
      },
      "UpdateAgentRequest": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Agent display name" },
          "purpose": { "type": "string", "description": "Agent description/purpose" },
          "systemPrompt": { "type": ["string", "null"], "description": "System prompt for the agent" },
          "toolsConfig": { "type": ["object", "null"], "description": "Tool configuration" },
          "provider": { "type": "string", "description": "AI provider (ollama, openai, etc.)" },
          "model": { "type": "string", "description": "AI model to use" },
          "isolationMode": { "type": "string", "description": "Isolation configuration" },
          "maxConcurrentTasks": { "type": "number", "description": "Maximum concurrent tasks" },
          "peerAccess": { "type": "boolean", "description": "Allow peer access" }
        }
      },
      "Session": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Unique session identifier" },
          "agentId": { "type": "string", "description": "Associated agent ID" },
          "title": { "type": "string", "description": "Session title" },
          "messages": { "type": "array", "items": { "$ref": "#/components/schemas/ChatMessage" }, "description": "Chat messages in session" },
          "createdAt": { "type": "string", "format": "date-time", "description": "Creation timestamp" },
          "updatedAt": { "type": "string", "format": "date-time", "description": "Last update timestamp" }
        },
        "required": ["id", "agentId", "createdAt", "updatedAt"]
      },
      "ErrorResponse": {
        "type": "object",
        "properties": {
          "success": { "type": "boolean", "description": "Request success status" },
          "error": {
            "type": "object",
            "properties": {
              "message": { "type": "string", "description": "Error message" },
              "code": { "type": "string", "description": "Error code" },
              "type": { "type": "string", "description": "Error type" },
              "timestamp": { "type": "string", "format": "date-time", "description": "Error timestamp" }
            },
            "required": ["message", "timestamp"]
          }
        },
        "required": ["success", "error"]
      },
      "AuthProvider": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Provider name" },
          "endpoint": { "type": "string", "description": "Provider endpoint URL" },
          "apiKey": { "type": "string", "description": "API key for authentication" },
          "enabled": { "type": "boolean", "description": "Whether provider is enabled" }
        },
        "required": ["name", "endpoint", "enabled"]
      },
      "Preset": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Unique preset identifier" },
          "name": { "type": "string", "description": "Preset display name" },
          "description": { "type": "string", "description": "Preset description" },
          "model": { "type": "string", "description": "Default model for preset" },
          "settings": { "type": "object", "description": "Preset configuration settings" },
          "createdAt": { "type": "string", "format": "date-time", "description": "Creation timestamp" },
          "updatedAt": { "type": "string", "format": "date-time", "description": "Last update timestamp" }
        },
        "required": ["id", "name", "model", "createdAt", "updatedAt"]
      },
      "SettingsResponse": {
        "type": "object",
        "properties": {
          "cors": {
            "type": "object",
            "properties": {
              "allowedOrigins": { "type": "array", "items": { "type": "string" } },
              "allowCredentials": { "type": "boolean" },
              "allowedMethods": { "type": "array", "items": { "type": "string" } },
              "allowedHeaders": { "type": "array", "items": { "type": "string" } }
            }
          },
          "server": {
            "type": "object",
            "properties": {
              "port": { "type": "number" },
              "host": { "type": "string" }
            }
          }
        }
      },
      "TokenUsage": {
        "type": "object",
        "properties": {
          "agentId": { "type": "string", "description": "Agent identifier" },
          "tokensUsed": { "type": "number", "description": "Total tokens used" },
          "requestsCount": { "type": "number", "description": "Number of requests" },
          "lastReset": { "type": "string", "format": "date-time", "description": "Last reset timestamp" }
        }
      }
    },
    "securitySchemes": {
      "ApiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "Authorization",
        "description": "Bearer token authentication"
      }
    }
  },
  "security": [
    {
      "ApiKeyAuth": []
    }
  ],
  "paths": {
    "/health": {
      "get": {
        "summary": "Health check",
        "description": "Check if the API server is running and healthy",
        "tags": ["System"],
        "responses": {
          "200": {
            "description": "Server is healthy",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/HealthResponse" },
                "example": { "ok": true, "service": "zsiistant", "version": "1.0.0", "uptime": 3600000 }
              }
            }
          }
        }
      }
    },
    "/info": {
      "get": {
        "summary": "API information",
        "description": "Get basic API information and metadata",
        "tags": ["System"],
        "responses": {
          "200": {
            "description": "API information",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "name": { "type": "string" },
                    "version": { "type": "string" },
                    "description": { "type": "string" },
                    "documentation": { "type": "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/agents": {
      "get": {
        "summary": "List all agents",
        "description": "Retrieve a list of all configured AI agents",
        "tags": ["Agents"],
        "responses": {
          "200": {
            "description": "List of agents",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/Agent" }
                },
                "example": [
                  {
                    "id": "d721ddf2-f7ec-4d2e-bd43-3400925ae9b8",
                    "name": "Test Integration Agent",
                    "purpose": "For testing integration workflows",
                    "provider": "ollama",
                    "model": "qwen3:1.7b",
                    "status": "idle",
                    "maxConcurrentTasks": 2,
                    "createdAt": "2026-05-15T08:12:45.193Z",
                    "updatedAt": "2026-05-15T08:12:45.193Z"
                  }
                ]
              }
            }
          }
        }
      },
      "post": {
        "summary": "Create new agent",
        "description": "Create a new AI agent with specified configuration",
        "tags": ["Agents"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/CreateAgentRequest" }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Agent created successfully",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Agent" }
              }
            }
          },
          "400": {
            "description": "Invalid request data",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/agents/{id}": {
      "get": {
        "summary": "Get agent details",
        "description": "Retrieve detailed information for a specific agent",
        "tags": ["Agents"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Agent ID",
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "Agent details",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Agent" }
              }
            }
          },
          "404": {
            "description": "Agent not found",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      },
      "put": {
        "summary": "Update agent",
        "description": "Update an existing agent's configuration",
        "tags": ["Agents"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Agent ID",
            "schema": { "type": "string" }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/UpdateAgentRequest" }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Agent updated successfully",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Agent" }
              }
            }
          },
          "404": {
            "description": "Agent not found",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      },
      "patch": {
        "summary": "Partial update agent",
        "description": "Partially update an existing agent's configuration",
        "tags": ["Agents"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Agent ID",
            "schema": { "type": "string" }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/UpdateAgentRequest" }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Agent updated successfully",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Agent" }
              }
            }
          }
        }
      },
      "delete": {
        "summary": "Delete agent",
        "description": "Delete an existing agent and all related data",
        "tags": ["Agents"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Agent ID",
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "Agent deleted successfully"
          },
          "404": {
            "description": "Agent not found",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/chat": {
      "post": {
        "summary": "Send chat message",
        "description": "Send a message to an AI agent and receive a response. Supports streaming for real-time responses.",
        "tags": ["Chat"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/ChatMessage" }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Chat response",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ChatResponse" }
              }
            }
          },
          "400": {
            "description": "Invalid request data",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "404": {
            "description": "Agent not found",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/chat/sessions": {
      "get": {
        "summary": "List chat sessions",
        "description": "Retrieve all chat sessions across all agents",
        "tags": ["Sessions"],
        "responses": {
          "200": {
            "description": "List of sessions",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/Session" }
                }
              }
            }
          }
        }
      },
      "post": {
        "summary": "Create chat session",
        "description": "Create a new chat session with optional agent assignment",
        "tags": ["Sessions"],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "agentId": { "type": "string", "description": "Optional agent ID for the session" },
                  "title": { "type": "string", "description": "Optional session title" }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Session created",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Session" }
              }
            }
          }
        }
      }
    },
    "/api/chat/sessions/{id}": {
      "get": {
        "summary": "Get session details",
        "description": "Retrieve details for a specific chat session",
        "tags": ["Sessions"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Session ID",
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "Session details",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Session" }
              }
            }
          },
          "404": {
            "description": "Session not found",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      },
      "delete": {
        "summary": "Delete session",
        "description": "Delete a chat session and all its messages",
        "tags": ["Sessions"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "Session ID",
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "Session deleted"
          },
          "404": {
            "description": "Session not found",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/settings": {
      "get": {
        "summary": "Get current settings",
        "description": "Retrieve current API configuration settings",
        "tags": ["Settings"],
        "responses": {
          "200": {
            "description": "Current settings",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/SettingsResponse" }
              }
            }
          }
        }
      },
      "patch": {
        "summary": "Update settings",
        "description": "Update API settings at runtime. Changes are applied immediately.",
        "tags": ["Settings"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "cors": { "$ref": "#/components/schemas/SettingsResponse/properties/cors" },
                  "server": { "$ref": "#/components/schemas/SettingsResponse/properties/server" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Settings updated",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/SettingsResponse" }
              }
            }
          }
        }
      }
    },
    "/api/providers": {
      "get": {
        "summary": "List AI providers",
        "description": "Get available AI providers and their current status",
        "tags": ["Providers"],
        "responses": {
          "200": {
            "description": "List of providers",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/AuthProvider" }
                },
                "example": [
                  {
                    "name": "ollama",
                    "endpoint": "http://localhost:11434",
                    "enabled": true
                  },
                  {
                    "name": "openai",
                    "endpoint": "https://api.openai.com/v1",
                    "enabled": false
                  }
                ]
              }
            }
          }
        }
      }
    },
    "/api/presets": {
      "get": {
        "summary": "List configuration presets",
        "description": "Get available configuration presets for agent setup",
        "tags": ["Presets"],
        "responses": {
          "200": {
            "description": "List of presets",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/Preset" }
                }
              }
            }
          }
        }
      },
      "post": {
        "summary": "Create preset",
        "description": "Create a new configuration preset for agents",
        "tags": ["Presets"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { 
                "type": "object",
                "properties": {
                  "name": { "type": "string" },
                  "description": { "type": "string" },
                  "model": { "type": "string" },
                  "settings": { "type": "object" }
                },
                "required": ["name", "model"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Preset created",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Preset" }
              }
            }
          }
        }
      }
    },
    "/api/tools": {
      "get": {
        "summary": "List available tools",
        "description": "Get information about available tools and their capabilities",
        "tags": ["Tools"],
        "responses": {
          "200": {
            "description": "List of available tools",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "name": { "type": "string" },
                      "description": { "type": "string" },
                      "category": { "type": "string" },
                      "enabled": { "type": "boolean" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/token-usage": {
      "get": {
        "summary": "Get token usage statistics",
        "description": "Retrieve token usage statistics for all agents",
        "tags": ["Tokens"],
        "responses": {
          "200": {
            "description": "Token usage statistics",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/TokenUsage" }
                }
              }
            }
          }
        }
      }
    }
  }
};

export default openapiSpec;