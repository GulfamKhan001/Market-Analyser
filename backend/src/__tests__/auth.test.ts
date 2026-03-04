import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock config
const mockSettings = { APP_API_KEY: '' };
vi.mock('../config', () => ({
  getSettings: vi.fn(() => mockSettings),
}));

import { apiKeyAuth } from '../middleware/auth';

function createMockReqRes(path: string, apiKey?: string) {
  const req = {
    path,
    headers: apiKey ? { 'x-api-key': apiKey } : {},
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('apiKeyAuth middleware', () => {
  beforeEach(() => {
    mockSettings.APP_API_KEY = '';
  });

  it('passes through when no API key is configured', () => {
    mockSettings.APP_API_KEY = '';
    const { req, res, next } = createMockReqRes('/portfolio/positions');
    apiKeyAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes through for public paths', () => {
    mockSettings.APP_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes('/health');
    apiKeyAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes through for /docs', () => {
    mockSettings.APP_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes('/docs');
    apiKeyAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when API key is required but missing', () => {
    mockSettings.APP_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes('/portfolio/positions');
    apiKeyAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.stringContaining('Unauthorized') }),
    );
  });

  it('returns 401 when API key is wrong', () => {
    mockSettings.APP_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes('/market/prices/AAPL', 'wrong-key');
    apiKeyAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('passes through when correct API key is provided', () => {
    mockSettings.APP_API_KEY = 'secret-key-123';
    const { req, res, next } = createMockReqRes('/market/prices/AAPL', 'secret-key-123');
    apiKeyAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
