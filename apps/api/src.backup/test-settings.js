const { createServer } = require('node:http');
const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:4000', 'http://127.0.0.1:3000', 'http://127.0.0.1:4000'];

const isOriginAllowed = (origin) => {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
};

const sendJson = (response, req1, statusCode, payload) => {
  const request = (req1 && req1.url) ? req1 : (req1 && req1.method ? { url: '', method: req1 } : null);
  const origin = response.getHeader('origin');
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
  
  console.log('Origin:', origin, 'isAllowed:', isOriginAllowed(origin), 'request:', request?.url);
  
  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else if (request && request.url?.startsWith('/api/')) {
    // Block unauthorized origins for API endpoints
    response.writeHead(403, {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(JSON.stringify({ error: 'Forbidden: Origin not allowed' }));
    return;
  }
  
  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(payload));
};

const server = createServer((req, res) => {
  if (req.url === '/api/settings' && req.method === 'GET') {
    const origin = req.headers.origin;
    res.setHeader('origin', origin || '');
    sendJson(res, req, 200, { test: 'success' });
  }
});

server.listen(4001, () => console.log('Test server on 4001'));
