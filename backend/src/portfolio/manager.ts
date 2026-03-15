/**
 * Portfolio manager — CRUD operations, price updates, CSV import, and snapshots.
 */

import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import { getPrisma } from '../db/client';
import { getSettings } from '../config';
import { recordTransaction, recordCashChange } from './transactions';
import { startOfDay, toDateString } from '../utils/format';
import { getYahooFinance } from '../utils/yahooFinance';
import { fetchFundamentals } from '../ingestion/yahoo';

export async function addPosition(
  prisma: PrismaClient,
  opts: {
    ticker: string;
    entryDate: Date;
    entryPrice: number;
    quantity: number;
    positionType?: string;
    notes?: string | null;
  },
) {
  const db = prisma;
  const ticker = opts.ticker.toUpperCase();

  // Try to pull sector from existing fundamentals, fetch if missing
  let fundamental = await db.fundamental.findFirst({
    where: { ticker },
    orderBy: { dateFetched: 'desc' },
  });
  if (!fundamental?.sector) {
    try {
      await fetchFundamentals(ticker, db);
      fundamental = await db.fundamental.findFirst({
        where: { ticker },
        orderBy: { dateFetched: 'desc' },
      });
    } catch {}
  }

  const position = await db.portfolioPosition.create({
    data: {
      ticker,
      entryDate: startOfDay(opts.entryDate),
      entryPrice: String(opts.entryPrice),
      quantity: String(opts.quantity),
      positionType: opts.positionType || 'long',
      sector: fundamental?.sector || null,
      notes: opts.notes || null,
    },
  });

  // Record transaction and cash change
  const txn = await recordTransaction(db, {
    ticker,
    transactionType: 'BUY',
    txnDate: opts.entryDate,
    price: opts.entryPrice,
    quantity: opts.quantity,
    positionId: position.id,
  });

  const totalCost = Math.round(opts.entryPrice * opts.quantity * 100) / 100;
  await recordCashChange(db, -totalCost, 'BUY', txn.id);

  console.log(`Added position: ${ticker} x${opts.quantity} @ ${opts.entryPrice}`);
  return position;
}

export async function updatePosition(
  prisma: PrismaClient,
  positionId: number,
  updates: Record<string, any>,
) {
  const db = prisma;

  const position = await db.portfolioPosition.findUnique({ where: { id: positionId } });
  if (!position) return null;

  const data: any = {};
  const allowed = ['entryPrice', 'quantity', 'positionType', 'notes', 'currentPrice', 'unrealizedPnl', 'sector'];
  for (const [key, value] of Object.entries(updates)) {
    // Map snake_case from API to camelCase
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (allowed.includes(camelKey)) {
      if (camelKey === 'entryPrice' || camelKey === 'quantity') {
        data[camelKey] = String(value);
      } else {
        data[camelKey] = value;
      }
    }
  }

  const updated = await db.portfolioPosition.update({
    where: { id: positionId },
    data,
  });

  console.log(`Updated position ${positionId}: ${Object.keys(updates)}`);
  return updated;
}

export async function deletePosition(prisma: PrismaClient, positionId: number): Promise<boolean> {
  const db = prisma;

  const position = await db.portfolioPosition.findUnique({ where: { id: positionId } });
  if (!position) return false;

  const sellPrice = position.currentPrice || Number(position.entryPrice);
  const quantity = Number(position.quantity);

  const txn = await recordTransaction(db, {
    ticker: position.ticker,
    transactionType: 'SELL',
    txnDate: new Date(),
    price: sellPrice,
    quantity,
    positionId,
  });

  const totalProceeds = Math.round(sellPrice * quantity * 100) / 100;
  await recordCashChange(db, totalProceeds, 'SELL', txn.id);

  await db.portfolioPosition.delete({ where: { id: positionId } });
  console.log(`Deleted position ${positionId}`);
  return true;
}

export async function getPositions(prisma?: PrismaClient) {
  const db = prisma || getPrisma();
  return db.portfolioPosition.findMany({
    orderBy: { entryDate: 'desc' },
  });
}

export async function updateCurrentPrices(prisma?: PrismaClient): Promise<void> {
  const db = prisma || getPrisma();
  const positions = await getPositions(db);
  if (positions.length === 0) return;

  const tickers = [...new Set(positions.map(p => p.ticker))];
  const latestPrices: Record<string, number> = {};
  const tickerSectors: Record<string, string> = {};

  for (const ticker of tickers) {
    try {
      const yahooFinance = await getYahooFinance();
      const quote = await yahooFinance.quote(ticker);
      if (quote?.regularMarketPrice) {
        latestPrices[ticker] = quote.regularMarketPrice;
      }
    } catch (e) {
      console.warn(`No price data for ${ticker}`);
    }
  }

  // Backfill missing sectors: try fundamentals table first, then fetch from Yahoo
  const needsSector = positions.filter(p => !p.sector);
  if (needsSector.length > 0) {
    const tickersNeedingSector = [...new Set(needsSector.map(p => p.ticker))];
    for (const ticker of tickersNeedingSector) {
      // 1) Check fundamentals table
      const fundamental = await db.fundamental.findFirst({
        where: { ticker },
        orderBy: { dateFetched: 'desc' },
      });
      if (fundamental?.sector) {
        tickerSectors[ticker] = fundamental.sector;
        continue;
      }
      // 2) Fetch directly from Yahoo quoteSummary
      try {
        const yahooFinance = await getYahooFinance();
        const summary = await yahooFinance.quoteSummary(ticker, { modules: ['assetProfile'] });
        const sector = summary?.assetProfile?.sector;
        if (sector) {
          tickerSectors[ticker] = sector;
          console.log(`Fetched sector for ${ticker}: ${sector}`);
        }
      } catch {
        console.warn(`Could not fetch sector for ${ticker}`);
      }
    }
  }

  for (const position of positions) {
    const price = latestPrices[position.ticker];
    const sectorBackfill = !position.sector ? tickerSectors[position.ticker] : undefined;

    if (price === undefined && !sectorBackfill) continue;

    const updateData: Record<string, any> = {};

    if (price !== undefined) {
      const entryPrice = Number(position.entryPrice);
      const qty = Number(position.quantity);
      let pnl: number;

      if (position.positionType === 'short') {
        pnl = Math.round((entryPrice - price) * qty * 100) / 100;
      } else {
        pnl = Math.round((price - entryPrice) * qty * 100) / 100;
      }

      updateData.currentPrice = Math.round(price * 10000) / 10000;
      updateData.unrealizedPnl = pnl;
    }

    if (sectorBackfill) {
      updateData.sector = sectorBackfill;
    }

    await db.portfolioPosition.update({
      where: { id: position.id },
      data: updateData,
    });
  }

  console.log(`Updated current prices for ${positions.length} positions`);
}

export async function getPortfolioSummary(prisma?: PrismaClient): Promise<Record<string, any>> {
  const db = prisma || getPrisma();
  const positions = await getPositions(db);

  let totalValue = 0;
  let totalCost = 0;
  let totalPnl = 0;
  const sectorValues: Record<string, number> = {};

  for (const p of positions) {
    const price = p.currentPrice || Number(p.entryPrice);
    const qty = Number(p.quantity);
    const mv = price * qty;
    totalValue += mv;
    totalCost += Number(p.entryPrice) * qty;
    totalPnl += p.unrealizedPnl || 0;

    const sector = p.sector || 'Unknown';
    sectorValues[sector] = (sectorValues[sector] || 0) + mv;
  }

  const sectorAllocation: Record<string, number> = {};
  if (totalValue > 0) {
    for (const [s, v] of Object.entries(sectorValues)) {
      sectorAllocation[s] = Math.round((v / totalValue) * 10000) / 100;
    }
  }

  return {
    total_value: Math.round(totalValue * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    total_pnl: Math.round(totalPnl * 100) / 100,
    total_pnl_pct: totalCost > 0 ? Math.round((totalPnl / totalCost) * 10000) / 10000 : 0,
    position_count: positions.length,
    sector_allocation: sectorAllocation,
  };
}

export async function importFromCsv(prisma: PrismaClient, filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const records = parse(content, { columns: true, skip_empty_lines: true });
  const imported: any[] = [];

  for (const row of records) {
    try {
      const position = await addPosition(prisma, {
        ticker: (row.ticker || '').trim(),
        entryDate: new Date(row.entry_date),
        entryPrice: parseFloat(row.entry_price),
        quantity: parseFloat(row.quantity),
        positionType: (row.position_type || 'long').trim(),
      });
      imported.push(position);
    } catch (e) {
      console.error(`Skipping CSV row:`, row, e);
    }
  }

  return imported;
}

export async function importVestedCsv(prisma: PrismaClient, filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const records = parse(content, { columns: true, skip_empty_lines: true });
  const imported: any[] = [];

  for (const row of records) {
    try {
      const ticker = (row.Ticker || '').trim();
      const qty = parseFloat(row.Qty || '0');
      const avgCost = parseFloat((row['Avg Cost'] || '0').replace(/[$,]/g, ''));
      if (!ticker || qty <= 0) continue;

      const position = await addPosition(prisma, {
        ticker: ticker.toUpperCase(),
        entryDate: new Date(),
        entryPrice: avgCost,
        quantity: qty,
        positionType: 'long',
        notes: `Imported from Vested: ${row.Name || ''}`,
      });
      imported.push(position);
    } catch (e) {
      console.error(`Skipping Vested CSV row:`, row, e);
    }
  }

  return imported;
}

export async function takeSnapshot(prisma?: PrismaClient) {
  const db = prisma || getPrisma();
  const todayDate = startOfDay();
  const summary = await getPortfolioSummary(db);

  let riskMetrics: Record<string, any> = {};
  try {
    const { computeRiskMetrics } = await import('./risk');
    riskMetrics = await computeRiskMetrics(db);
  } catch (e) {
    console.warn('Could not compute risk metrics for snapshot:', e);
  }

  // Daily return from previous snapshot
  const prev = await db.portfolioSnapshot.findFirst({
    where: { date: { lt: todayDate } },
    orderBy: { date: 'desc' },
  });

  let dailyReturn: number | null = null;
  if (prev?.totalValue && prev.totalValue > 0) {
    dailyReturn = Math.round(((summary.total_value - prev.totalValue) / prev.totalValue) * 1e6) / 1e6;
  }

  // Upsert
  const existing = await db.portfolioSnapshot.findUnique({ where: { date: todayDate } });

  const data = {
    totalValue: summary.total_value,
    dailyReturn,
    drawdown: riskMetrics.max_drawdown ?? null,
    var95: riskMetrics.var_95 ?? null,
    cvar95: riskMetrics.cvar_95 ?? null,
    sharpeRatio: riskMetrics.sharpe_ratio ?? null,
    sortinoRatio: riskMetrics.sortino_ratio ?? null,
    beta: riskMetrics.beta ?? null,
    sectorAllocationsJson: summary.sector_allocation,
  };

  if (existing) {
    await db.portfolioSnapshot.update({ where: { id: existing.id }, data });
  } else {
    await db.portfolioSnapshot.create({ data: { date: todayDate, ...data } });
  }

  console.log(`Snapshot saved for ${toDateString(todayDate)} — value=${summary.total_value.toFixed(2)}`);
}

export async function computeTwr(prisma?: PrismaClient): Promise<Record<string, any>> {
  const db = prisma || getPrisma();

  const snapshots = await db.portfolioSnapshot.findMany({
    where: { dailyReturn: { not: null } },
    orderBy: { date: 'asc' },
  });

  if (snapshots.length === 0) {
    return { twr_total: 0, twr_annualized: 0, days: 0 };
  }

  let cumulative = 1;
  for (const s of snapshots) {
    cumulative *= 1 + (s.dailyReturn || 0);
  }

  const twrTotal = cumulative - 1;
  const days = snapshots.length;
  const twrAnnualized = days > 1 ? Math.pow(cumulative, 252 / days) - 1 : 0;

  return {
    twr_total: Math.round(twrTotal * 1e6) / 1e6,
    twr_annualized: Math.round(twrAnnualized * 1e6) / 1e6,
    days,
  };
}
