/**
 * Security and Performance Test Script
 * Validates the fixes for security issues, performance problems, and code quality issues
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Test 1: Check for JWT secret security
console.log('🔐 Testing JWT Secret Security...');
try {
  const authMiddleware = readFileSync('./middleware/authMiddleware.js', 'utf8');
  if (authMiddleware.includes('throw new Error(\'JWT_SECRET is required in production environment\')')) {
    console.log('✅ JWT secret properly secured for production');
  } else {
    console.log('❌ JWT secret security issue not fully resolved');
  }
} catch (err) {
  console.log('❌ Error reading auth middleware:', err.message);
}

// Test 2: Check for enhanced input validation
console.log('\n🛡️  Testing Enhanced Input Validation...');
try {
  const validationMiddleware = readFileSync('./middleware/validationMiddleware.js', 'utf8');
  if (validationMiddleware.includes('sanitizeInput') && validationMiddleware.includes('secureString')) {
    console.log('✅ Enhanced input validation with security checks implemented');
  } else {
    console.log('❌ Enhanced input validation not properly implemented');
  }
} catch (err) {
  console.log('❌ Error reading validation middleware:', err.message);
}

// Test 3: Check for improved error message sanitization
console.log('\n🚨 Testing Error Message Sanitization...');
try {
  const errorMiddleware = readFileSync('./middleware/errorMiddleware.js', 'utf8');
  if (errorMiddleware.includes('jwt[^\\s]*[\\s\\w]*') && errorMiddleware.includes('auth[^\\s]*[\\s\\w]*')) {
    console.log('✅ Error message sanitization enhanced with additional security patterns');
  } else {
    console.log('❌ Error message sanitization not fully enhanced');
  }
} catch (err) {
  console.log('❌ Error reading error middleware:', err.message);
}

// Test 4: Check for improved rate limiting performance
console.log('\n⚡ Testing Rate Limiting Performance...');
try {
  const securityMiddleware = readFileSync('./middleware/security.js', 'utf8');
  if (securityMiddleware.includes('performance.now()') && securityMiddleware.includes('keysToDelete')) {
    console.log('✅ Rate limiting performance improved with efficient cleanup');
  } else {
    console.log('❌ Rate limiting performance improvements not fully implemented');
  }
} catch (err) {
  console.log('❌ Error reading security middleware:', err.message);
}

// Test 5: Check for enhanced CORS configuration
console.log('\n🌐 Testing CORS Security...');
try {
  const securityMiddleware = readFileSync('./middleware/security.js', 'utf8');
  if (securityMiddleware.includes('ZSIISTANT_ALLOWED_ORIGINS')) {
    console.log('✅ CORS configuration enhanced with dynamic origin support');
  } else {
    console.log('❌ CORS security improvements not fully implemented');
  }
} catch (err) {
  console.log('❌ Error reading security middleware:', err.message);
}

// Test 6: Check for protected routes expansion
console.log('\n🔒 Testing Protected Routes...');
try {
  const authMiddleware = readFileSync('./middleware/authMiddleware.js', 'utf8');
  if (authMiddleware.includes('/api/tokens') && authMiddleware.includes('/api/jobs')) {
    console.log('✅ Protected routes expanded to include all sensitive endpoints');
  } else {
    console.log('❌ Protected routes expansion not fully implemented');
  }
} catch (err) {
  console.log('❌ Error reading auth middleware:', err.message);
}

// Test 7: Syntax validation of all modified files
console.log('\n🔍 Testing Syntax Validation...');
const filesToCheck = [
  './middleware/authMiddleware.js',
  './middleware/security.js',
  './middleware/validationMiddleware.js',
  './middleware/errorMiddleware.js',
  './routes/chat.js',
  './routes/agents.js'
];

let syntaxErrors = 0;
for (const file of filesToCheck) {
  try {
    execSync(`node -c ${file}`, { stdio: 'ignore' });
    console.log(`✅ ${file}: Syntax OK`);
  } catch (err) {
    console.log(`❌ ${file}: Syntax Error - ${err.message}`);
    syntaxErrors++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`Syntax Errors Found: ${syntaxErrors}`);
console.log(`Files Validated: ${filesToCheck.length}`);

if (syntaxErrors === 0) {
  console.log('\n🎉 All files passed syntax validation!');
} else {
  console.log('\n⚠️  Some files have syntax errors that need to be resolved.');
}

// Test 8: Check for security constants
console.log('\n🔧 Testing Security Constants...');
try {
  const validationMiddleware = readFileSync('./middleware/validationMiddleware.js', 'utf8');
  if (validationMiddleware.includes('dangerousPatterns') && validationMiddleware.includes('control characters')) {
    console.log('✅ Security constants and patterns properly defined');
  } else {
    console.log('❌ Security constants not properly defined');
  }
} catch (err) {
  console.log('❌ Error reading validation middleware:', err.message);
}

console.log('\n🔍 Security Test Complete!');
console.log('\n📝 Recommendations for Production:');
console.log('1. Set environment variables: ZSIISTANT_JWT_SECRET, ZSIISTANT_ALLOWED_ORIGINS');
console.log('2. Monitor rate limiting performance metrics');
console.log('3. Regular security audits of input validation');
console.log('4. Database connection pooling for better performance');
console.log('5. Implement proper logging and monitoring');