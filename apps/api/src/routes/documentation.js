/**
 * Documentation Routes - OpenAPI/Swagger UI endpoints
 */

import swaggerUi from 'swagger-ui-express';
import openapiSpec from '../openapi.js';

export function registerDocumentationRoutes(server, registry, providers, failoverChains, settings) {
  console.log('Documentation routes being registered');
  
  // Serve OpenAPI specification as JSON
  server.on('request', (req, res) => {
    if (req.method === 'GET' && req.url === '/api-docs.json') {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(openapiSpec, null, 2));
    }
  });

  // Basic info endpoint
  server.on('request', (req, res) => {
    if (req.method === 'GET' && req.url === '/info') {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({
        name: 'Zsiistant API',
        version: openapiSpec.info.version,
        description: openapiSpec.info.description,
        documentation: '/api-docs'
      }, null, 2));
    }
  });

  // Simple HTML Swagger UI documentation
  server.on('request', (req, res) => {
    if (req.method === 'GET' && req.url === '/api-docs') {
      const swaggerHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Zsiistant API Documentation</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css">
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: #fafafa;
    }
    .swagger-ui .topbar {
      display: none;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/api-docs.json',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout",
        deepLinking: true,
        showExtensions: true,
        showCommonExtensions: true
      });
    };
  </script>
</body>
</html>
      `;
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(swaggerHtml);
    }
  });
}