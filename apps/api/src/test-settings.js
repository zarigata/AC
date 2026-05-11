import { createServer } from 'node:http';
const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:4000', 'http://127.0.0.1:3000', 'http://127.0.0.1:4000'];

// Security: Enhanced origin validation with comprehensive checks
const isOriginAllowed = (origin) => {
  if (!origin || typeof origin !== 'string') return false;
  
  // Basic length check
  if (origin.length > 2048) {
    console.warn('Origin too long:', origin);
    return false;
  }
  
  // Validate origin format with comprehensive security checks
  try {
    const url = new URL(origin);
    
    // Protocol validation - only allow http/https
    if (!url.protocol.match(/^https?:$/i)) {
      console.warn('Invalid protocol in origin:', origin);
      return false;
    }
    
    // Check for dangerous patterns in hostname
    const hostname = url.hostname;
    const dangerousPatterns = [
      /^.*\.internal$/, /^.*\.local$/, /^.*\.lan$/,
      /^.*\.(test|staging|dev)\.internal$/, /\.(development|staging)\./,
      /^.*\.(admin|login|auth|api)\./
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(hostname))) {
      console.warn('Dangerous hostname pattern in origin:', origin);
      return false;
    }
    
    // Check if URL contains credentials (security risk)
    if (url.username || url.password) {
      console.warn('Origin contains credentials:', origin);
      return false;
    }
    
    // Validate port
    if (url.port) {
      const port = parseInt(url.port, 10);
      if (port < 1 || port > 65535) {
        console.warn('Invalid port in origin:', origin);
        return false;
      }
    }
    
    // Check against allowed origins with case-insensitive matching
    const normalizedOrigin = origin.toLowerCase();
    const normalizedUrlOrigin = url.origin.toLowerCase();
    
    return ALLOWED_ORIGINS.some(allowed => 
      normalizedOrigin === allowed.toLowerCase() || 
      normalizedUrlOrigin === allowed.toLowerCase()
    );
  } catch (err) {
    console.error('Invalid origin format:', origin, 'error:', err.message);
    return false;
  }
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
