import { PrismaClient } from '@prisma/client';
import { encryptionMiddleware } from './encryption';

let _prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.DEBUG === 'true' ? ['query', 'error', 'warn'] : ['error'],
    });

    // Apply encryption middleware for sensitive fields
    _prisma.$use(encryptionMiddleware);
  }
  return _prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
