// This script will fix the broken regex in security.js

import { readFileSync, writeFileSync } from 'fs';

const filePath = '/root/.openclaw/workspace/AC/apps/api/src/middleware/security.js';

// Read the file
const content = readFileSync(filePath, 'utf8');

// Replace the broken regex with a complete one
const fixedContent = content.replace(
  '      // Validate user agent format\n      if (userAgent && !userAgent.match(/^[a-zA-Z0-9\\s\\._\\-\\+\\(\\)\\[\\]\\{\\}:;\\*\\?\\,\\!\\#\\@\\$\\%\\&=<>|~',
  '      // Validate user agent format - simple validation\n      if (userAgent && !userAgent.match(/^[\\w\\s\\._\\-\\+\\(\\)\\[\\]\\{\\}:;\\*\\?\\,\\!\\#\\@\\$\\%\\&=<>|~\\\"\\'\\\\]+$/i)) {\n        return false;\n      }'
);

// Write the fixed content back
writeFileSync(filePath, fixedContent, 'utf8');

console.log('Fixed the broken regex in security.js');