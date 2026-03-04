/**
 * Express application entry point.
 */

import express from 'express';
import cors from 'cors';
import { getSettings } from './config';
import { getPrisma } from './db/client';
import { startScheduler } from './ingestion/scheduler';

import marketRouter from './routes/market';
import analysisRouter from './routes/analysis';
import portfolioRouter from './routes/portfolio';
import aiRouter from './routes/ai';
import regimeRouter from './routes/regime';
import { apiKeyAuth } from './middleware/auth';

const settings = getSettings();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(apiKeyAuth);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: settings.APP_NAME });
});

// Mount routers
app.use('/market', marketRouter);
app.use('/analysis', analysisRouter);
app.use('/portfolio', portfolioRouter);
app.use('/ai', aiRouter);
app.use('/regime', regimeRouter);

// Start server
async function main() {
  // Initialize Prisma connection
  const prisma = getPrisma();
  await prisma.$connect();
  console.log('Database connected');

  // Start scheduler if enabled
  if (settings.SCHEDULER_ENABLED) {
    startScheduler();
  }

  const port = settings.PORT || 8000;
  app.listen(port, () => {
    console.log(`${settings.APP_NAME} running on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
