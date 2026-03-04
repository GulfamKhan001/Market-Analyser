/**
 * Transaction audit trail and cash balance ledger.
 */

import { PrismaClient } from '@prisma/client';
import { getPrisma } from '../db/client';
import { startOfDay } from '../utils/format';

export async function recordTransaction(
  prisma: PrismaClient,
  opts: {
    ticker: string;
    transactionType: string;
    txnDate: Date;
    price: number;
    quantity: number;
    fees?: number;
    positionId?: number | null;
    notes?: string | null;
  },
) {
  const totalAmount = Math.round(opts.price * opts.quantity * 100) / 100;

  const txn = await prisma.transaction.create({
    data: {
      ticker: opts.ticker.toUpperCase(),
      transactionType: opts.transactionType,
      date: startOfDay(opts.txnDate),
      price: String(opts.price),
      quantity: String(opts.quantity),
      totalAmount: String(totalAmount),
      fees: opts.fees || 0,
      positionId: opts.positionId || null,
      notes: opts.notes || null,
    },
  });

  console.log(
    `Transaction recorded: ${opts.transactionType} ${opts.ticker} x${opts.quantity} @ ${opts.price} (id=${txn.id})`,
  );
  return txn;
}

export async function recordCashChange(
  prisma: PrismaClient,
  amount: number,
  reason: string,
  referenceId?: number | null,
) {
  const latest = await getCashBalance(prisma);
  const previousBalance = latest ? latest.balance_usd : 0;
  const newBalance = Math.round((previousBalance + amount) * 100) / 100;

  const entry = await prisma.cashBalance.create({
    data: {
      date: startOfDay(),
      balanceUsd: String(newBalance),
      changeAmount: String(Math.round(amount * 100) / 100),
      changeReason: reason,
      referenceId: referenceId || null,
    },
  });

  console.log(`Cash change: ${amount >= 0 ? '+' : ''}${amount.toFixed(2)} (${reason}) → balance=${newBalance.toFixed(2)}`);
  return entry;
}

export async function getTransactions(
  prisma?: PrismaClient,
  ticker?: string | null,
  limit: number = 100,
): Promise<any[]> {
  const db = prisma || getPrisma();

  const where: any = {};
  if (ticker) where.ticker = ticker.toUpperCase();

  const rows = await db.transaction.findMany({
    where,
    orderBy: { date: 'desc' },
    take: limit,
  });

  return rows.map(t => ({
    id: t.id,
    ticker: t.ticker,
    transaction_type: t.transactionType,
    date: t.date.toISOString().split('T')[0],
    price: Number(t.price),
    quantity: Number(t.quantity),
    total_amount: Number(t.totalAmount),
    fees: t.fees,
    position_id: t.positionId,
    notes: t.notes,
    created_at: t.createdAt?.toISOString() || null,
  }));
}

export async function getCashBalance(
  prisma?: PrismaClient,
): Promise<{ id: number; date: string; balance_usd: number; change_amount: number; change_reason: string; reference_id: number | null } | null> {
  const db = prisma || getPrisma();

  const latest = await db.cashBalance.findFirst({
    orderBy: { id: 'desc' },
  });

  if (!latest) return null;

  return {
    id: latest.id,
    date: latest.date.toISOString().split('T')[0],
    balance_usd: Number(latest.balanceUsd),
    change_amount: Number(latest.changeAmount),
    change_reason: latest.changeReason,
    reference_id: latest.referenceId,
  };
}
