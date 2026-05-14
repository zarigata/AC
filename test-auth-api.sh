#!/bin/bash

# Test Authentication API Endpoints

# Base URL
BASE_URL="http://localhost:4000"

echo "🧪 Testing Authentication API Endpoints..."

# Test 1: Register new user
echo "\n📝 Test 1: Register new user"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser2",
    "email": "testuser2@example.com",
    "password": "password123"
  }')

echo "Response: $RESPONSE"

# Test 2: Login with user
echo "\n🔐 Test 2: Login with user"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser2",
    "password": "password123"
  }')

echo "Response: $RESPONSE"

# Test 3: Get current user info (with auth)
echo "\n👤 Test 3: Get current user info (requires auth)"
# Extract access token from login response
ACCESS_TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$ACCESS_TOKEN" ]; then
  RESPONSE=$(curl -s -X GET "$BASE_URL/api/auth/me" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json")
  
  echo "Response: $RESPONSE"
else
  echo "❌ No access token found in login response"
fi

echo "\n✅ Authentication API tests completed!"