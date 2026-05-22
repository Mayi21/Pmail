/**
 * JWT Key Manager Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JWTKeyManager } from '../../src/services/jwtKeyManager';
import { mockEnv } from '../setup';

describe('JWTKeyManager', () => {
  let keyManager: JWTKeyManager;

  beforeEach(() => {
    keyManager = new JWTKeyManager(mockEnv);
    vi.clearAllMocks();
  });

  describe('getActiveKey', () => {
    it('should return active key when available', async () => {
      const activeKey = {
        id: 'key1',
        key: 'test-secret-key-at-least-32-characters-long',
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      mockEnv.JWT_KEYS.list.mockResolvedValueOnce({
        keys: [
          {
            name: 'jwt_key_1',
            metadata: {
              status: 'active',
              created_at: activeKey.createdAt,
            },
          },
        ],
      });

      mockEnv.JWT_KEYS.get.mockResolvedValueOnce(JSON.stringify(activeKey));

      const result = await keyManager.getActiveKey();

      expect(result).toEqual(activeKey);
      expect(mockEnv.JWT_KEYS.list).toHaveBeenCalled();
      expect(mockEnv.JWT_KEYS.get).toHaveBeenCalledWith('jwt_key_1');
    });

    it('should generate new key if no active key exists', async () => {
      mockEnv.JWT_KEYS.list.mockResolvedValueOnce({ keys: [] });
      mockEnv.JWT_KEYS.put.mockResolvedValueOnce(undefined);

      const result = await keyManager.getActiveKey();

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('key');
      expect(result.status).toBe('active');
      expect(mockEnv.JWT_KEYS.put).toHaveBeenCalled();
    });
  });

  describe('rotateKeys', () => {
    it('should retire active keys and create new one', async () => {
      const activeKey = {
        id: 'old-key',
        key: 'old-secret-key-at-least-32-characters-long',
        status: 'active',
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(), // 31 days old
      };

      mockEnv.JWT_KEYS.list.mockResolvedValue({
        keys: [
          {
            name: 'jwt_key_old',
            metadata: {
              status: 'active',
              created_at: activeKey.createdAt,
            },
          },
        ],
      });

      mockEnv.JWT_KEYS.get.mockResolvedValue(JSON.stringify(activeKey));
      mockEnv.JWT_KEYS.put.mockResolvedValue(undefined);

      await keyManager.rotateKeys();

      // Verify old key was updated to retired
      expect(mockEnv.JWT_KEYS.put).toHaveBeenCalledWith(
        'jwt_key_old',
        expect.stringContaining('"status":"retired"'),
        expect.any(Object)
      );

      // Verify new key was created
      expect(mockEnv.JWT_KEYS.put).toHaveBeenCalledWith(
        expect.stringContaining('jwt_key_'),
        expect.stringContaining('"status":"active"'),
        expect.any(Object)
      );
    });

    it('should not rotate keys if rotation period not met', async () => {
      const activeKey = {
        id: 'current-key',
        key: 'current-secret-key-at-least-32-characters',
        status: 'active',
        createdAt: new Date().toISOString(), // Just created
      };

      mockEnv.JWT_KEYS.list.mockResolvedValueOnce({
        keys: [
          {
            name: 'jwt_key_current',
            metadata: {
              status: 'active',
              created_at: activeKey.createdAt,
            },
          },
        ],
      });

      mockEnv.JWT_KEYS.get.mockResolvedValueOnce(JSON.stringify(activeKey));

      await keyManager.rotateKeys();

      // Should only be called once to check the key, not to update
      expect(mockEnv.JWT_KEYS.put).not.toHaveBeenCalled();
    });
  });

  describe('signToken', () => {
    it('should sign token with active key', async () => {
      const activeKey = {
        id: 'key1',
        key: 'test-secret-key-at-least-32-characters-long-for-signing',
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      mockEnv.JWT_KEYS.list.mockResolvedValueOnce({
        keys: [
          {
            name: 'jwt_key_1',
            metadata: {
              status: 'active',
              created_at: activeKey.createdAt,
            },
          },
        ],
      });

      mockEnv.JWT_KEYS.get.mockResolvedValueOnce(JSON.stringify(activeKey));

      const payload = {
        sub: '123',
        username: 'testuser',
      };

      const token = await keyManager.signToken(payload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });
  });

  describe('verifyToken', () => {
    it('should verify token signed with active key', async () => {
      const activeKey = {
        id: 'key1',
        key: 'test-secret-key-at-least-32-characters-long-for-verify',
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      mockEnv.JWT_KEYS.list.mockResolvedValue({
        keys: [
          {
            name: 'jwt_key_1',
            metadata: {
              status: 'active',
              created_at: activeKey.createdAt,
            },
          },
        ],
      });

      mockEnv.JWT_KEYS.get.mockResolvedValue(JSON.stringify(activeKey));

      const payload = {
        sub: '123',
        username: 'testuser',
      };

      // Sign a token
      const token = await keyManager.signToken(payload);

      // Verify the token
      const verified = await keyManager.verifyToken(token);

      expect(verified).toBeTruthy();
      expect(verified.sub).toBe('123');
      expect(verified.username).toBe('testuser');
    });

    it('should verify token with retired key during grace period', async () => {
      const retiredKey = {
        id: 'retired-key',
        key: 'retired-secret-key-at-least-32-characters-long',
        status: 'retired',
        createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
        retiredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // Retired 5 days ago
      };

      // First call for active key (none found)
      mockEnv.JWT_KEYS.list.mockResolvedValueOnce({ keys: [] });

      // Second call for retired keys
      mockEnv.JWT_KEYS.list.mockResolvedValueOnce({
        keys: [
          {
            name: 'jwt_key_retired',
            metadata: {
              status: 'retired',
              created_at: retiredKey.createdAt,
              retired_at: retiredKey.retiredAt,
            },
          },
        ],
      });

      mockEnv.JWT_KEYS.get.mockResolvedValue(JSON.stringify(retiredKey));

      // Create a token with the retired key (simulating old token)
      const { SignJWT } = await import('jose');
      const jwt = await new SignJWT({ sub: '123', username: 'testuser' })
        .setProtectedHeader({ alg: 'HS256', kid: retiredKey.id })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(new TextEncoder().encode(retiredKey.key));

      const verified = await keyManager.verifyToken(jwt);

      expect(verified).toBeTruthy();
      expect(verified.sub).toBe('123');
    });

    it('should reject invalid token', async () => {
      await expect(keyManager.verifyToken('invalid.token.here')).rejects.toThrow();
    });
  });

  describe('cleanupOldKeys', () => {
    it('should delete keys past grace period', async () => {
      const veryOldRetiredKey = {
        name: 'jwt_key_very_old',
        metadata: {
          status: 'retired',
          created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
          retired_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Retired 30 days ago
        },
      };

      const recentRetiredKey = {
        name: 'jwt_key_recent',
        metadata: {
          status: 'retired',
          created_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
          retired_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // Retired 2 days ago
        },
      };

      mockEnv.JWT_KEYS.list.mockResolvedValueOnce({
        keys: [veryOldRetiredKey, recentRetiredKey],
      });

      mockEnv.JWT_KEYS.delete.mockResolvedValue(undefined);

      await keyManager.cleanupOldKeys();

      // Should only delete the very old key
      expect(mockEnv.JWT_KEYS.delete).toHaveBeenCalledWith('jwt_key_very_old');
      expect(mockEnv.JWT_KEYS.delete).not.toHaveBeenCalledWith('jwt_key_recent');
    });
  });
});