/**
 * OpenAPI 3.0 Specification for Zsiistant API
 * Auto-generated API documentation
 */

const openapiSpec = {
  "openapi": "3.0.0",
  "info": {
    "title": "Zsiistant API",
    "description": "REST API for Zsiistant AI assistant service with provider failover, agent management, and session persistence",
    "version": "1.0.0",
    "contact": {
      "name": "Zsiistant Team",
      "email": "support@zsiistant.com"
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
          "ok": { "type": "boolean" },
          "service": { "type": "string" },
          "version": { "type": "string" },
          "uptime": { "type": "number" }
        }
      },
      "ChatMessage": {
        "type": "object",
        "properties": {
          "message": { "type": "string" },
          "agentId": { "type": "string" },
          "stream": { "type": "boolean", "default": false }
        },
        "required": ["message", "agentId"]
      },
      "ChatResponse": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "content": { "type": "string" },
          "agentId": { "type": "string" },
          "timestamp": { "type": "string", "format": "date-time" }
        }
      },
      "Agent": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "description": { "type": "string" },
          "model": { "type": "string" },
          "preset": { "type": "string" },
          "createdAt": { "type": "string", "format": "date-time" },
          "updatedAt": { "type": "string", "format": "date-time" }
        }
      },
      "CreateAgentRequest": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "description": { "type": "string" },
          "model": { "type": "string" },
          "preset": { "type": "string" }
        },
        "required": ["name", "model"]
      },
      "UpdateAgentRequest": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "description": { "type": "string" },
          "model": { "type": "string" },
          "preset": { "type": "string" }
        }
      },
      "Session": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "agentId": { "type": "string" },
          "title": { "type": "string" },
          "messages": { "type": "array", "items": { "$ref": "#/components/schemas/ChatMessage" } },
          "createdAt": { "type": "string", "format": "date-time" },
          "updatedAt": { "type": "string", "format": "date-time" }
        }
      },
      "ErrorResponse": {
        "type": "object",
        "properties": {
          "success": { "type": "boolean" },
          "error": {
            "type": "object",
            "properties": {
              "message": { "type": "string" },
              "code": { "type": "string" },
              "type": { "type": "string" },
              "timestamp": { "type": "string", "format": "date-time" }
            }
          }
        }
      },
      "AuthProvider": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "endpoint": { "type": "string" },
          "apiKey": { "type": "string" },
          "enabled": { "type": "boolean" }
        }
      },
      "Preset": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "description": { "type": "string" },
          "model": { "type": "string" },
          "settings": { "type": "object" },
          "createdAt": { "type": "string", "format": "date-time" },
          "updatedAt": { "type": "string", "format": "date-time" }
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
                "schema": { "$ref": "#/components/schemas/HealthResponse" }
              }
            }
          }
        }
      }
    },
    "/api/agents": {
      "get": {
        "summary": "List all agents",
        "description": "Retrieve a list of all configured agents",
        "tags": ["Agents"],
        "responses": {
          "200": {
            "description": "List of agents",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/Agent" }
                }
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
          }
        }
      }
    },
    "/api/agents/{id}": {
      "get": {
        "summary": "Get agent details",
        "description": "Retrieve details for a specific agent",
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
          }
        }
      },
      "delete": {
        "summary": "Delete agent",
        "description": "Delete an existing agent",
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
          }
        }
      }
    },
    "/api/chat": {
      "post": {
        "summary": "Send chat message",
        "description": "Send a message to an AI agent and receive a response",
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
          }
        }
      }
    },
    "/api/sessions": {
      "get": {
        "summary": "List sessions",
        "description": "Retrieve all chat sessions",
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
        "summary": "Create session",
        "description": "Create a new chat session",
        "tags": ["Sessions"],
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
    "/api/sessions/{id}": {
      "get": {
        "summary": "Get session",
        "description": "Retrieve details for a specific session",
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
          }
        }
      },
      "delete": {
        "summary": "Delete session",
        "description": "Delete a chat session",
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
          }
        }
      }
    },
    "/api/settings": {
      "get": {
        "summary": "Get settings",
        "description": "Retrieve current API settings",
        "tags": ["Settings"],
        "responses": {
          "200": {
            "description": "Current settings",
            "content": {
              "application/json": {
                "schema": { "type": "object" }
              }
            }
          }
        }
      },
      "patch": {
        "summary": "Update settings",
        "description": "Update API settings at runtime",
        "tags": ["Settings"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "type": "object" }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Settings updated",
            "content": {
              "application/json": {
                "schema": { "type": "object" }
              }
            }
          }
        }
      }
    },
    "/api/providers": {
      "get": {
        "summary": "List providers",
        "description": "Get available AI providers and their status",
        "tags": ["Providers"],
        "responses": {
          "200": {
            "description": "List of providers",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": { "$ref": "#/components/schemas/AuthProvider" }
                }
              }
            }
          }
        }
      }
    },
    "/api/presets": {
      "get": {
        "summary": "List presets",
        "description": "Get available configuration presets",
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
        "description": "Create a new configuration preset",
        "tags": ["Presets"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "type": "object" }
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
    }
  }
};

export default openapiSpec;