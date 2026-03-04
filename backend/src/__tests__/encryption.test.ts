import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Use a stable key for all encrypt/decrypt calls
const STABLE_KEY = crypto.randomBytes(32).toString('hex');

vi.mock('../config', () => ({
  getSettings: vi.fn(() => ({
    DB_ENCRYPTION_KEY: STABLE_KEY,
  })),
}));

import { encrypt, decrypt } from '../db/encryption';

describe('encrypt/decrypt round-trip', () => {
  it('encrypts and decrypts a positive number', () => {
    const original = 123.456;
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(String(original));
    expect(encrypted).toContain(':'); // iv:tag:ciphertext format
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBeCloseTo(original, 6);
  });

  it('encrypts and decrypts zero', () => {
    const encrypted = encrypt(0);
    expect(decrypt(encrypted)).toBe(0);
  });

  it('encrypts and decrypts negative numbers', () => {
    const encrypted = encrypt(-99.99);
    expect(decrypt(encrypted)).toBeCloseTo(-99.99, 6);
  });

  it('encrypts and decrypts very large numbers', () => {
    const original = 1234567890.123456;
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBeCloseTo(original, 4);
  });

  it('produces different ciphertexts for same value (random IV)', () => {
    const a = encrypt(42);
    const b = encrypt(42);
    expect(a).not.toBe(b);
  });

  it('encrypted format has three colon-separated parts', () => {
    const encrypted = encrypt(100);
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3);
  });
});

describe('decrypt fallback for plain values', () => {
  it('decrypts a plain number string', () => {
    // When value is a plain string (not encrypted), decrypt should parse it
    expect(decrypt('42.5')).toBeCloseTo(42.5);
  });

  it('returns 0 for non-numeric strings', () => {
    expect(decrypt('not-a-number')).toBe(0);
  });
});
