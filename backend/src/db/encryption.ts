import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { getSettings } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer | null {
  const settings = getSettings();
  const keyHex = settings.DB_ENCRYPTION_KEY;
  if (!keyHex) return null;
  try {
    return Buffer.from(keyHex, 'hex');
  } catch {
    console.error('Invalid DB_ENCRYPTION_KEY — must be 64-char hex string');
    return null;
  }
}

export function encrypt(value: number): string {
  const key = getKey();
  const strVal = String(value);
  if (!key) return strVal; // graceful fallback: store as plain string

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(strVal, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(value: string): number {
  const key = getKey();

  if (!key) {
    // No encryption key — try to parse as plain float
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }

  // Check if the value looks encrypted (has the iv:tag:ciphertext format)
  const parts = value.split(':');
  if (parts.length !== 3) {
    // Might be a plain value from before encryption was enabled
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }

  try {
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return parseFloat(decrypted.toString('utf8'));
  } catch {
    // Fallback: might be a plain value
    const num = parseFloat(value);
    if (!isNaN(num)) return num;
    console.error('Failed to decrypt field value');
    return 0;
  }
}

// Encrypted fields mapping: model -> fields that need encryption
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  PortfolioPosition: ['entryPrice', 'quantity'],
  Transaction: ['price', 'quantity', 'totalAmount'],
  CashBalance: ['balanceUsd', 'changeAmount'],
};

/**
 * Prisma middleware that transparently encrypts on write and decrypts on read
 * for sensitive financial fields.
 */
export const encryptionMiddleware: Prisma.Middleware = async (params, next) => {
  const model = params.model;
  if (!model || !ENCRYPTED_FIELDS[model]) {
    return next(params);
  }

  const fields = ENCRYPTED_FIELDS[model];

  // Encrypt on create/update
  if (params.action === 'create' || params.action === 'update' || params.action === 'upsert') {
    const data = params.args.data;
    if (data) {
      for (const field of fields) {
        if (data[field] !== undefined && data[field] !== null && typeof data[field] === 'number') {
          data[field] = encrypt(data[field]);
        }
      }
    }
    // Handle upsert's create and update data
    if (params.action === 'upsert') {
      const create = params.args.create;
      const update = params.args.update;
      if (create) {
        for (const field of fields) {
          if (create[field] !== undefined && create[field] !== null && typeof create[field] === 'number') {
            create[field] = encrypt(create[field]);
          }
        }
      }
      if (update) {
        for (const field of fields) {
          if (update[field] !== undefined && update[field] !== null && typeof update[field] === 'number') {
            update[field] = encrypt(update[field]);
          }
        }
      }
    }
    // Handle createMany
    if (params.action === 'create' && params.args.data && Array.isArray(params.args.data)) {
      for (const item of params.args.data) {
        for (const field of fields) {
          if (item[field] !== undefined && item[field] !== null && typeof item[field] === 'number') {
            item[field] = encrypt(item[field]);
          }
        }
      }
    }
  }

  const result = await next(params);

  // Decrypt on read
  if (result) {
    const decryptFields = (obj: any) => {
      if (!obj || typeof obj !== 'object') return obj;
      for (const field of fields) {
        if (obj[field] !== undefined && obj[field] !== null && typeof obj[field] === 'string') {
          obj[field] = decrypt(obj[field]);
        }
      }
      return obj;
    };

    if (Array.isArray(result)) {
      result.forEach(decryptFields);
    } else if (typeof result === 'object') {
      decryptFields(result);
    }
  }

  return result;
};
