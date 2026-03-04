/**
 * API key authentication middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { getSettings } from '../config';

const PUBLIC_PATHS = new Set(['/health', '/docs', '/openapi.json']);

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const settings = getSettings();

  // Skip auth if no API key is configured
  if (!settings.APP_API_KEY) {
    next();
    return;
  }

  // Skip auth for public paths
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }

  // Validate API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== settings.APP_API_KEY) {
    res.status(401).json({ detail: 'Unauthorized: invalid or missing API key' });
    return;
  }

  next();
}
