/**
 * Authentication Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import authRoutes from '../../src/routes/auth';
import { mockEnv, mockContext, createMockRequest } from '../setup';

describe('Auth Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/auth', authRoutes);
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      // Mock DB responses
      mockEnv.DB.prepare().first.mockResolvedValueOnce(null); // No existing user
      mockEnv.DB.prepare().run.mockResolvedValueOnce({
        meta: { last_row_id: 1 }
      });

      const request = createMockRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: 'testuser',
          email: 'test@example.com',
          password: 'TestPass123',
        }),
      });

      const response = await app.fetch(request, mockEnv, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('user_id');
      expect(data.data.username).toBe('testuser');
    });

    it('should reject duplicate username', async () => {
      // Mock existing user
      mockEnv.DB.prepare().first.mockResolvedValueOnce({ id: 1 });

      const request = createMockRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: 'existinguser',
          email: 'new@example.com',
          password: 'TestPass123',
        }),
      });

      const response = await app.fetch(request, mockEnv, mockContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('already exists');
    });

    it('should validate password requirements', async () => {
      const request = createMockRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: 'testuser',
          email: 'test@example.com',
          password: 'weak', // Too short and no uppercase/numbers
        }),
      });

      const response = await app.fetch(request, mockEnv, mockContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Validation error');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
      const hashedPassword = await bcrypt.hash('TestPass123', 10);

      // Mock user in DB
      mockEnv.DB.prepare().first.mockResolvedValueOnce({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password_hash: hashedPassword,
      });

      const request = createMockRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: 'testuser',
          password: 'TestPass123',
        }),
      });

      const response = await app.fetch(request, mockEnv, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('token');
      expect(data.data.user.username).toBe('testuser');
    });

    it('should reject invalid credentials', async () => {
      mockEnv.DB.prepare().first.mockResolvedValueOnce(null); // User not found

      const request = createMockRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: 'nonexistent',
          password: 'TestPass123',
        }),
      });

      const response = await app.fetch(request, mockEnv, mockContext);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid username or password');
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should initiate password reset for existing user', async () => {
      // Mock user exists
      mockEnv.DB.prepare().first.mockResolvedValueOnce({
        id: 1,
        username: 'testuser',
      });

      // Mock KV storage
      mockEnv.CACHE.put.mockResolvedValueOnce(undefined);

      const request = createMockRequest('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      });

      const response = await app.fetch(request, mockEnv, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('password reset link has been sent');

      // Verify token was stored
      expect(mockEnv.CACHE.put).toHaveBeenCalled();
    });

    it('should return success even for non-existent email (prevent enumeration)', async () => {
      // Mock user doesn't exist
      mockEnv.DB.prepare().first.mockResolvedValueOnce(null);

      const request = createMockRequest('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: 'nonexistent@example.com',
        }),
      });

      const response = await app.fetch(request, mockEnv, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('password reset link has been sent');

      // Verify no token was stored
      expect(mockEnv.CACHE.put).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      const tokenData = {
        user_id: 1,
        email: 'test@example.com',
        expires: Date.now() + 3600000, // Valid for 1 hour
      };

      // Mock token retrieval
      mockEnv.CACHE.get.mockResolvedValueOnce(JSON.stringify(tokenData));

      // Mock password update
      mockEnv.DB.prepare().run.mockResolvedValueOnce({ success: true });

      // Mock token deletion
      mockEnv.CACHE.delete.mockResolvedValueOnce(undefined);

      const request = createMockRequest('http://localhost/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: 'test-token',
          new_password: 'NewPass123',
        }),
      });

      const response = await app.fetch(request, mockEnv, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('Password has been reset');

      // Verify token was deleted after use
      expect(mockEnv.CACHE.delete).toHaveBeenCalled();
    });

    it('should reject expired token', async () => {
      const tokenData = {
        user_id: 1,
        email: 'test@example.com',
        expires: Date.now() - 1000, // Already expired
      };

      // Mock token retrieval
      mockEnv.CACHE.get.mockResolvedValueOnce(JSON.stringify(tokenData));

      const request = createMockRequest('http://localhost/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: 'expired-token',
          new_password: 'NewPass123',
        }),
      });

      const response = await app.fetch(request, mockEnv, mockContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('expired');
    });
  });
});