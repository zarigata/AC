/**
 * Test Authentication System - User Registration and Login
 */

import { UserManager } from "./apps/api/src/database/userManager.js";

const userManager = new UserManager('./data/zsiistant.sqlite');

async function testAuthSystem() {
  try {
    console.log('🔧 Initializing User Manager...');
    await userManager.initialize();
    console.log('✅ User Manager initialized');

    // Test user creation
    console.log('\n👤 Creating test user...');
    const user = await userManager.createUser({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123'
    });
    console.log('✅ User created:', {
      id: user.id,
      username: user.username,
      email: user.email
    });

    // Test user authentication
    console.log('\n🔐 Testing user authentication...');
    const authUser = await userManager.authenticateUser('testuser', 'password123');
    console.log('✅ Authentication successful:', {
      id: authUser.id,
      username: authUser.username
    });

    // Test token creation
    console.log('\n🎫 Creating access token...');
    const accessToken = await userManager.createAccessToken(authUser);
    console.log('✅ Access token created:', accessToken.substring(0, 50) + '...');

    // Test refresh token creation
    console.log('\n🔄 Creating refresh token...');
    const refreshToken = await userManager.createRefreshToken(authUser.id);
    console.log('✅ Refresh token created:', refreshToken.substring(0, 50) + '...');

    // Test token refresh
    console.log('\n🔄 Testing token refresh...');
    const newAccessToken = await userManager.refreshAccessToken(refreshToken);
    console.log('✅ Token refreshed:', newAccessToken.substring(0, 50) + '...');

    console.log('\n🎉 All authentication tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await userManager.close();
  }
}

testAuthSystem();