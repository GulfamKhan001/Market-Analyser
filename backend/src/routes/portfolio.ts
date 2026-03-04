/**
 * Portfolio routes — 24 endpoints.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import { getPrisma } from '../db/client';
import {
  addPosition, updatePosition, deletePosition,
  getPositions, updateCurrentPrices,
  getPortfolioSummary, takeSnapshot, importFromCsv,
  importVestedCsv, computeTwr,
} from '../portfolio/manager';
import {
  computeRiskMetrics, computeConcentration,
  correlationClusters, stressTestScenarios,
} from '../portfolio/risk';
import { suggestPositionSize, optimizeAllocation } from '../portfolio/optimizer';
import { getTransactions, getCashBalance, recordCashChange } from '../portfolio/transactions';
import { runMonteCarlo } from '../portfolio/monteCarlo';
import { computeCurrencyExposure } from '../portfolio/currency';
import { computeHealthScore } from '../portfolio/health';

const router = Router();
const upload = multer({ dest: '/tmp/' });

// GET /portfolio/positions
router.get('/positions', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const positions = await getPositions(db);
    res.json({
      count: positions.length,
      positions: positions.map((p: any) => ({
        id: p.id,
        ticker: p.ticker,
        entry_date: p.entryDate instanceof Date ? p.entryDate.toISOString().split('T')[0] : p.entryDate,
        entry_price: p.entryPrice,
        quantity: p.quantity,
        current_price: p.currentPrice,
        unrealized_pnl: p.unrealizedPnl,
        sector: p.sector,
        position_type: p.positionType,
        notes: p.notes,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /portfolio/positions
router.post('/positions', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const { ticker, entry_date, entry_price, quantity, position_type, notes } = req.body;
    const position = await addPosition(db, {
      ticker: ticker.toUpperCase(),
      entryDate: new Date(entry_date),
      entryPrice: entry_price,
      quantity,
      positionType: position_type || 'long',
      notes: notes || null,
    });
    res.json({ id: position.id, ticker: position.ticker, status: 'created' });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// PUT /portfolio/positions/:id
router.put('/positions/:id', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const positionId = parseInt(req.params.id);
    const updates: Record<string, any> = {};
    if (req.body.entry_price !== undefined) updates.entryPrice = req.body.entry_price;
    if (req.body.quantity !== undefined) updates.quantity = req.body.quantity;
    if (req.body.position_type !== undefined) updates.positionType = req.body.position_type;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ detail: 'No fields to update' });
      return;
    }

    const position = await updatePosition(db, positionId, updates);
    if (!position) {
      res.status(404).json({ detail: 'Position not found' });
      return;
    }
    res.json({ id: position.id, status: 'updated' });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// DELETE /portfolio/positions/:id
router.delete('/positions/:id', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const positionId = parseInt(req.params.id);
    const success = await deletePosition(db, positionId);
    if (!success) {
      res.status(404).json({ detail: 'Position not found' });
      return;
    }
    res.json({ status: 'deleted' });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /portfolio/refresh-prices
router.post('/refresh-prices', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    await updateCurrentPrices(db);
    res.json({ status: 'prices updated' });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/summary
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    await updateCurrentPrices(db);
    const summary = await getPortfolioSummary(db);
    res.json(summary);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/risk
router.get('/risk', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const metrics = await computeRiskMetrics(db);
    res.json(metrics);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/optimize
router.get('/optimize', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const result = await optimizeAllocation(db);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/position-size/:ticker
router.get('/position-size/:ticker', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = req.params.ticker.toUpperCase();
    const result = await suggestPositionSize(ticker, db);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /portfolio/snapshot
router.post('/snapshot', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    await takeSnapshot(db);
    res.json({ status: 'snapshot created' });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /portfolio/import-csv
router.post('/import-csv', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    if (!req.file) {
      res.status(400).json({ detail: 'No file uploaded' });
      return;
    }
    const count = await importFromCsv(db, req.file.path);
    fs.unlinkSync(req.file.path);
    res.json({ status: 'imported', positions_added: count });
  } catch (e: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ detail: e.message });
  }
});

// POST /portfolio/import-vested
router.post('/import-vested', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    if (!req.file) {
      res.status(400).json({ detail: 'No file uploaded' });
      return;
    }
    const positions = await importVestedCsv(db, req.file.path);
    fs.unlinkSync(req.file.path);
    res.json({ status: 'imported', positions_added: positions.length });
  } catch (e: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/transactions
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const ticker = (req.query.ticker as string) || undefined;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 1000);
    const transactions = await getTransactions(db, ticker, limit);
    res.json({ transactions });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/cash
router.get('/cash', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const balance = await getCashBalance(db);
    res.json(balance || { balance_usd: 0.0, change_amount: 0.0, change_reason: 'NONE' });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /portfolio/cash/deposit
router.post('/cash/deposit', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ detail: 'Amount must be positive' });
      return;
    }
    const entry = await recordCashChange(db, amount, 'DEPOSIT');
    res.json({ status: 'deposited', new_balance: entry.balanceUsd });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /portfolio/cash/withdraw
router.post('/cash/withdraw', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ detail: 'Amount must be positive' });
      return;
    }
    const entry = await recordCashChange(db, -amount, 'WITHDRAWAL');
    res.json({ status: 'withdrawn', new_balance: entry.balanceUsd });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/monte-carlo
router.get('/monte-carlo', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const paths = Math.min(Math.max(parseInt(req.query.paths as string) || 1000, 10), 10000);
    const horizon = Math.min(Math.max(parseInt(req.query.horizon as string) || 252, 5), 504);
    const result = await runMonteCarlo(db, paths, horizon);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/stress-test
router.get('/stress-test', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const scenarios = await stressTestScenarios(db);
    res.json({ scenarios });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// POST /portfolio/stress-test
router.post('/stress-test', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const drops = req.body.drops || [-10, -20, -30];
    const scenarios = await stressTestScenarios(db, drops);
    res.json({ scenarios });
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/concentration
router.get('/concentration', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const result = await computeConcentration(db);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/correlation-clusters
router.get('/correlation-clusters', async (req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const threshold = parseFloat(req.query.threshold as string) || 0.7;
    const result = await correlationClusters(db, threshold);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/currency
router.get('/currency', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const result = await computeCurrencyExposure(db);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/twr
router.get('/twr', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const result = await computeTwr(db);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

// GET /portfolio/health
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const db = getPrisma();
    const result = await computeHealthScore(db);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ detail: e.message });
  }
});

export default router;
