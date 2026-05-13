// Test URL matching logic
const testUrl = '/api/webhooks';

console.log('Testing URL matching:');
console.log('Test URL:', testUrl);

// Test the URL parsing logic from the webhook handler
const url = new URL(testUrl, `http://localhost:4000`);
console.log('Parsed URL object:', url);
console.log('url.pathname:', url.pathname);

// Test matching patterns
const exactMatch = testUrl === '/api/webhooks';
console.log('Exact match test:', exactMatch);

const pathMatch = url.pathname.match(/^\/api\/webhooks\/([\w-]+)$/);
console.log('Path match test:', pathMatch);

const urlMatch = testUrl.match(/^\/api\/webhooks\/([\w-]+)$/);
console.log('URL match test:', urlMatch);

const startMatch = testUrl.startsWith('/api/webhooks/');
console.log('StartsWith test:', startMatch);

// Test the actual conditions from the handler
const method = 'GET';
const shouldHandleList = method === 'GET' && testUrl === '/api/webhooks';
const shouldHandleOperation = url.pathname.match(/^\/api\/webhooks\/([\w-]+)$/) && (method === 'GET' || method === 'POST' || method === 'DELETE' || method === 'PATCH');
const shouldHandleVerify = method === 'GET' && testUrl.startsWith('/api/webhooks/') && testUrl.match(/^\/api\/webhooks\/([\w-]+)\/verify$/);
const shouldHandlePost = method === 'POST' && (testUrl === '/api/webhooks/telegram' || testUrl === '/api/webhooks/telegram-default' || testUrl === '/api/webhooks/discord' || testUrl === '/api/webhooks/discord-default');

console.log('\nResults:');
console.log('shouldHandleList:', shouldHandleList);
console.log('shouldHandleOperation:', shouldHandleOperation);
console.log('shouldHandleVerify:', shouldHandleVerify);
console.log('shouldHandlePost:', shouldHandlePost);