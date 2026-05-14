/**
 * User Manager - Handles user authentication and management operations
 */

import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import SCHEMA from "./userSchema.js";

/**
 * User Manager class for handling user-related database operations
 */
export class UserManager {
  constructor(databasePath) {
    this.databasePath = databasePath;
    this.db = null;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize() {
    this.db = await open({
      filename: this.databasePath,
      driver: sqlite3.Database
    });

    // Enable foreign keys
    await this.db.exec("PRAGMA foreign_keys = ON");

    // Create tables if they don't exist
    await this.db.exec(SCHEMA);
    
    console.log("User database initialized successfully");
  }

  /**
   * Create a new user with hashed password
   */
  async createUser(userData) {
    const { username, email, password, role = 'user' } = userData;
    
    // Validate input
    if (!username || !email || !password) {
      throw new Error('Username, email, and password are required');
    }

    // Check if user already exists
    const existingUser = await this.getUserByUsername(username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const existingEmail = await this.getUserByEmail(email);
    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Generate salt and hash password
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(password, salt);

    // Create user
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await this.db.run(
      `INSERT INTO users (id, username, email, password_hash, salt, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, username, email, passwordHash, salt, role, now, now]
    );

    return this.getUserById(userId);
  }

  /**
   * Authenticate user with username/password
   */
  async authenticateUser(username, password) {
    if (!username || !password) {
      throw new Error('Username and password are required');
    }

    const user = await this.getUserByUsername(username);
    if (!user || !user.is_active) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const passwordHash = this.hashPassword(password, user.salt);
    if (passwordHash !== user.password_hash) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await this.db.run(
      `UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), new Date().toISOString(), user.id]
    );

    return user;
  }

  /**
   * Create a JWT access token
   */
  async createAccessToken(user) {
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      type: 'access'
    };
    
    const expiresIn = process.env.ZSIISTANT_JWT_EXPIRES_IN || '1h';
    const secret = process.env.ZSIISTANT_JWT_SECRET || 'development-secret-key';
    
    return jwt.sign(payload, secret, { expiresIn });
  }

  /**
   * Create a refresh token
   */
  async createRefreshToken(userId, deviceInfo = null, ipAddress = null) {
    const token = crypto.randomUUID();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    await this.db.run(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, device_info, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [token, userId, tokenHash, expiresAt.toISOString(), deviceInfo, ipAddress]
    );

    return token;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    // Find the refresh token
    const tokenHash = this.hashToken(refreshToken);
    const refreshRecord = await this.db.get(
      `SELECT * FROM refresh_tokens 
       WHERE token_hash = ? AND is_revoked = 0 AND expires_at > datetime('now')`,
      [tokenHash]
    );

    if (!refreshRecord) {
      throw new Error('Invalid or expired refresh token');
    }

    // Get user
    const user = await this.getUserById(refreshRecord.user_id);
    if (!user || !user.is_active) {
      throw new Error('User account is disabled');
    }

    // Update last used
    await this.db.run(
      `UPDATE refresh_tokens SET last_used = ? WHERE id = ?`,
      [new Date().toISOString(), refreshRecord.id]
    );

    // Create new access token
    return this.createAccessToken(user);
  }

  /**
   * Revoke a refresh token
   */
  async revokeRefreshToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    const tokenHash = this.hashToken(refreshToken);
    await this.db.run(
      `UPDATE refresh_tokens SET is_revoked = 1, updated_at = ? WHERE token_hash = ?`,
      [new Date().toISOString(), tokenHash]
    );
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    return this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username) {
    return this.db.get('SELECT * FROM users WHERE username = ?', [username]);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email) {
    return this.db.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  /**
   * Get all users (admin only)
   */
  async getAllUsers() {
    return this.db.all('SELECT id, username, email, role, created_at, last_login, is_active FROM users ORDER BY created_at DESC');
  }

  /**
   * Update user information
   */
  async updateUser(userId, updates) {
    const validFields = ['username', 'email', 'password', 'role', 'is_active'];
    const updateFields = Object.keys(updates).filter(field => validFields.includes(field));
    
    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = updateFields.map(field => `${field} = ?`).join(', ');
    const values = updateFields.map(field => {
      if (field === 'password') {
        const salt = crypto.randomBytes(16).toString('hex');
        return this.hashPassword(updates[field], salt);
      }
      return updates[field];
    });

    // Add salt if updating password
    if (updateFields.includes('password')) {
      const user = await this.getUserById(userId);
      if (user) {
        values.push(user.salt);
      }
    }

    values.push(new Date().toISOString());
    values.push(userId);

    await this.db.run(
      `UPDATE users SET ${setClause}, updated_at = ? WHERE id = ?`,
      values
    );

    return this.getUserById(userId);
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId) {
    await this.db.run('DELETE FROM users WHERE id = ?', [userId]);
  }

  /**
   * Clean up expired sessions and refresh tokens
   */
  async cleanup() {
    await this.db.run(
      `UPDATE user_sessions SET is_active = 0 WHERE expires_at <= datetime('now')`
    );
    await this.db.run(
      `UPDATE refresh_tokens SET is_revoked = 1 WHERE expires_at <= datetime('now')`
    );
  }

  /**
   * Hash password with salt
   */
  hashPassword(password, salt) {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
  }

  /**
   * Hash token for storage
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      await this.db.close();
    }
  }
}