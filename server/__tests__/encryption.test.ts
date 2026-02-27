import { describe, it, expect } from 'vitest';
import { encryptPassword, decryptPassword } from '../encryption';

describe('Encryption Module', () => {
  describe('encryptPassword / decryptPassword round-trip', () => {
    it('should encrypt and decrypt a simple password', async () => {
      const password = 'mySecretPassword123';
      const encrypted = await encryptPassword(password);
      const decrypted = await decryptPassword(encrypted);

      expect(decrypted).toBe(password);
    });

    it('should encrypt and decrypt an empty string', async () => {
      const password = '';
      const encrypted = await encryptPassword(password);
      // Encrypted empty string still has iv:authTag:ciphertext format
      expect(encrypted).toContain(':');
      const decrypted = await decryptPassword(encrypted);
      expect(decrypted).toBe(password);
    });

    it('should encrypt and decrypt special characters', async () => {
      const password = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
      const encrypted = await encryptPassword(password);
      const decrypted = await decryptPassword(encrypted);

      expect(decrypted).toBe(password);
    });

    it('should encrypt and decrypt unicode characters', async () => {
      const password = '密码测试🔒🔑日本語パスワード';
      const encrypted = await encryptPassword(password);
      const decrypted = await decryptPassword(encrypted);

      expect(decrypted).toBe(password);
    });

    it('should encrypt and decrypt a very long password', async () => {
      const password = 'a'.repeat(10000);
      const encrypted = await encryptPassword(password);
      const decrypted = await decryptPassword(encrypted);

      expect(decrypted).toBe(password);
    });

    it('should encrypt and decrypt passwords with newlines and whitespace', async () => {
      const password = 'pass\nword\twith\r\nwhitespace   ';
      const encrypted = await encryptPassword(password);
      const decrypted = await decryptPassword(encrypted);

      expect(decrypted).toBe(password);
    });
  });

  describe('Random IV produces different ciphertexts', () => {
    it('should produce different ciphertexts for the same password', async () => {
      const password = 'samePasswordEveryTime';
      const encrypted1 = await encryptPassword(password);
      const encrypted2 = await encryptPassword(password);
      const encrypted3 = await encryptPassword(password);

      expect(encrypted1).not.toBe(encrypted2);
      expect(encrypted2).not.toBe(encrypted3);
      expect(encrypted1).not.toBe(encrypted3);

      // All should decrypt to the same value
      expect(await decryptPassword(encrypted1)).toBe(password);
      expect(await decryptPassword(encrypted2)).toBe(password);
      expect(await decryptPassword(encrypted3)).toBe(password);
    });
  });

  describe('Encrypted format', () => {
    it('should produce iv:authTag:ciphertext format with hex values', async () => {
      const password = 'test';
      const encrypted = await encryptPassword(password);

      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);

      const [iv, authTag, ciphertext] = parts;
      // IV is 16 bytes = 32 hex chars
      expect(iv).toMatch(/^[0-9a-f]{32}$/);
      // Auth tag is 16 bytes = 32 hex chars
      expect(authTag).toMatch(/^[0-9a-f]{32}$/);
      // Ciphertext should be non-empty hex
      expect(ciphertext).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('Legacy fallback: decryptPassword returns unencrypted strings as-is', () => {
    it('should return plain text that has no colons as-is', async () => {
      const plaintext = 'legacyPlainTextPassword';
      const result = await decryptPassword(plaintext);

      expect(result).toBe(plaintext);
    });

    it('should return bcrypt hashes as-is (no colons)', async () => {
      const bcryptHash = '$2a$10$abcdefghijklmnopqrstuvwxyz123456789012345678901234';
      const result = await decryptPassword(bcryptHash);

      expect(result).toBe(bcryptHash);
    });

    it('should return strings with wrong number of colon-separated parts as-is', async () => {
      const twoPartsOnly = 'part1:part2';
      const result1 = await decryptPassword(twoPartsOnly);
      expect(result1).toBe(twoPartsOnly);

      const fourParts = 'part1:part2:part3:part4';
      const result2 = await decryptPassword(fourParts);
      expect(result2).toBe(fourParts);
    });
  });

  describe('Tampered ciphertext detection', () => {
    it('should return raw ciphertext when authTag is tampered', async () => {
      const password = 'sensitiveData';
      const encrypted = await encryptPassword(password);

      const parts = encrypted.split(':');
      // Flip a hex character in the auth tag
      const tamperedTag = parts[1][0] === 'a' ? 'b' + parts[1].slice(1) : 'a' + parts[1].slice(1);
      const tampered = `${parts[0]}:${tamperedTag}:${parts[2]}`;

      // decryptPassword is resilient — returns raw string on failure instead of throwing
      const result = await decryptPassword(tampered);
      expect(result).toBe(tampered);
    });

    it('should return raw ciphertext when ciphertext is tampered', async () => {
      const password = 'sensitiveData';
      const encrypted = await encryptPassword(password);

      const parts = encrypted.split(':');
      // Flip a hex character in the ciphertext
      const tamperedCipher = parts[2][0] === 'a' ? 'b' + parts[2].slice(1) : 'a' + parts[2].slice(1);
      const tampered = `${parts[0]}:${parts[1]}:${tamperedCipher}`;

      const result = await decryptPassword(tampered);
      expect(result).toBe(tampered);
    });

    it('should return raw ciphertext when IV is tampered', async () => {
      const password = 'sensitiveData';
      const encrypted = await encryptPassword(password);

      const parts = encrypted.split(':');
      // Flip a hex character in the IV
      const tamperedIv = parts[0][0] === 'a' ? 'b' + parts[0].slice(1) : 'a' + parts[0].slice(1);
      const tampered = `${tamperedIv}:${parts[1]}:${parts[2]}`;

      const result = await decryptPassword(tampered);
      expect(result).toBe(tampered);
    });
  });
});
