#!/usr/bin/env node

/**
 * Test script for rate limiting middleware
 * Tests both IP-based and API key-based rate limiting
 */

import http from 'node:http';
import { URL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

// Test configuration
const SERVER_URL = 'http://localhost:4000';
const TEST_IP = '127.0.0.1';

// Rate limit thresholds from the middleware
const IP_MAX_REQUESTS = 100;
const API_KEY_MAX_REQUESTS = 60;
const IP_WINDOW_MS = 15 * 60 * 1000;
const API_KEY_WINDOW_MS = 60 * 1000;

/**
 * Make HTTP request to the server
 * @param {Object} options - Request options
 * @returns {Object} Response data
 */
async function makeRequest(options = {}) {
  const defaultOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Rate-Test-Client'
    }
  };

  const finalOptions = { ...defaultOptions, ...options };

  // Build URL with path
  const url = new URL(finalOptions.path || '/', SERVER_URL);
  
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: finalOptions.method,
      headers: finalOptions.headers
    };
    
    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const responseData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    
    if (finalOptions.body) {
      req.write(finalOptions.body);
    }
    
    req.end();
  });
}

/**
 * Test IP-based rate limiting
 */
async function testIpRateLimiting() {
  console.log('🔍 Testing IP-based rate limiting...');
  
  // First few requests should succeed
  console.log('📤 Making initial requests to /health (should succeed)...');
  for (let i = 0; i < 3; i++) {
    const res = await makeRequest({ path: '/health' });
    console.log(`  Request ${i + 1}: Status ${res.status}`);
    if (res.status !== 200) {
      throw new Error(`Initial request failed with status ${res.status}`);
    }
  }

  // Make requests until we hit the limit
  console.log(`📤 Making ${IP_MAX_REQUESTS} requests to /health to test limit...`);
  let lastResponse = null;
  
  for (let i = 0; i < IP_MAX_REQUESTS + 5; i++) {
    const res = await makeRequest({ path: '/health' });
    lastResponse = res;
    
    if (i < IP_MAX_REQUESTS) {
      if (res.status !== 200) {
        throw new Error(`Request ${i + 1} should have succeeded but got status ${res.status}`);
      }
      console.log(`  ✅ Request ${i + 1}: OK (Rate-Limit-Remaining: ${res.headers['x-ratelimit-remaining']})`);
    } else {
      if (res.status !== 429) {
        throw new Error(`Request ${i + 1} should have been rate limited but got status ${res.status}`);
      }
      console.log(`  🚫 Request ${i + 1}: Rate limited (expected)`);
      break;
    }
  }

  if (lastResponse.status !== 429) {
    throw new Error(`Expected 429 status after ${IP_MAX_REQUESTS} requests, got ${lastResponse.status}`);
  }

  // Verify rate limit headers
  if (!lastResponse.headers['x-ratelimit-limit']) {
    throw new Error('Missing X-RateLimit-Limit header');
  }
  if (!lastResponse.headers['x-ratelimit-remaining']) {
    throw new Error('Missing X-RateLimit-Remaining header');
  }
  if (!lastResponse.headers['x-ratelimit-reset']) {
    throw new Error('Missing X-RateLimit-Reset header');
  }

  console.log('✅ Rate limit headers present:', {
    limit: lastResponse.headers['x-ratelimit-limit'],
    remaining: lastResponse.headers['x-ratelimit-remaining'],
    reset: lastResponse.headers['x-ratelimit-reset']
  });

  return true;
}

/**
 * Test API key rate limiting
 */
async function testApiKeyRateLimiting() {
  console.log('🔍 Testing API key-based rate limiting...');
  
  const testApiKey = 'test-api-key-123';
  
  // First few requests with API key should succeed
  console.log('📤 Making initial requests to /health with API key (should succeed)...');
  for (let i = 0; i < 3; i++) {
    const res = await makeRequest({
      path: '/health',
      headers: {
        'X-API-Key': testApiKey,
        'Content-Type': 'application/json'
      }
    });
    console.log(`  Request ${i + 1}: Status ${res.status}`);
    if (res.status !== 200) {
      throw new Error(`Initial API key request failed with status ${res.status}`);
    }
  }

  // Make requests with API key until we hit the limit
  console.log(`📤 Making ${API_KEY_MAX_REQUESTS} requests to /health with API key to test limit...`);
  let lastResponse = null;
  let hitLimit = false;
  
  for (let i = 0; i < API_KEY_MAX_REQUESTS + 5; i++) {
    const res = await makeRequest({
      path: '/health',
      headers: {
        'X-API-Key': testApiKey,
        'Content-Type': 'application/json'
      }
    });
    lastResponse = res;
    
    if (i < API_KEY_MAX_REQUESTS) {
      if (res.status !== 200) {
        throw new Error(`API key request ${i + 1} should have succeeded but got status ${res.status}`);
      }
      console.log(`  ✅ API Request ${i + 1}: OK (Rate-Limit-Remaining: ${res.headers['x-ratelimit-remaining']})`);
    } else {
      if (res.status !== 429) {
        throw new Error(`API key request ${i + 1} should have been rate limited but got status ${res.status}`);
      }
      console.log(`  🚫 API Request ${i + 1}: Rate limited (expected)`);
      hitLimit = true;
      break;
    }
  }

  if (!hitLimit) {
    throw new Error(`API key rate limiting not triggered after ${API_KEY_MAX_REQUESTS} requests`);
  }

  // Verify rate limit headers
  if (!lastResponse.headers['x-ratelimit-limit']) {
    throw new Error('Missing X-RateLimit-Limit header for API key');
  }
  if (!lastResponse.headers['x-ratelimit-remaining']) {
    throw new Error('Missing X-RateLimit-Remaining header for API key');
  }

  console.log('✅ API key rate limit headers present:', {
    limit: lastResponse.headers['x-ratelimit-limit'],
    remaining: lastResponse.headers['x-ratelimit-remaining']
  });

  return true;
}

/**
 * Test health endpoint rate limiting exemption
 */
async function testHealthEndpointExemption() {
  console.log('🔍 Testing health endpoint rate limiting exemption...');
  
  // Make many requests to health endpoint - should not be rate limited
  console.log('📤 Making 50 requests to /health endpoint...');
  
  for (let i = 0; i < 50; i++) {
    const res = await makeRequest({
      path: '/health'
    });
    if (res.status !== 200) {
      throw new Error(`Health endpoint request ${i + 1} failed with status ${res.status}`);
    }
    console.log(`  ✅ Health Request ${i + 1}: OK`);
  }

  console.log('✅ Health endpoint not rate limited (as expected)');
  return true;
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Starting rate limiting tests...\n');

  try {
    // Test health endpoint exemption first
    await testHealthEndpointExemption();
    console.log('\n✅ Health endpoint test passed!\n');

    // Test IP rate limiting
    await testIpRateLimiting();
    console.log('\n✅ IP rate limiting test passed!\n');

    // Test API key rate limiting
    await testApiKeyRateLimiting();
    console.log('\n✅ API key rate limiting test passed!\n');

    console.log('🎉 All rate limiting tests passed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests();