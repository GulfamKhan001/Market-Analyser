/**
 * Lazy-loaded wrapper for yahoo-finance2 v3 (ESM-only package).
 * Uses dynamic import() to work in CommonJS ts-node.
 * Includes rate-limiting and retry logic for 429 errors.
 */

let _yf: any = null;
let _lastCallTime = 0;
const MIN_CALL_INTERVAL_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRawYahooFinance(): Promise<any> {
  if (!_yf) {
    const mod = await import('yahoo-finance2');
    const YF = mod.default || mod;
    _yf = new YF({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
  }
  return _yf;
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - _lastCallTime;
  if (elapsed < MIN_CALL_INTERVAL_MS) {
    await sleep(MIN_CALL_INTERVAL_MS - elapsed);
  }
  _lastCallTime = Date.now();
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await throttle();
      return await fn();
    } catch (e: any) {
      const is429 = e?.code === 429 || e?.message?.includes('Too Many Requests');
      if (is429 && attempt < retries) {
        const backoff = (attempt + 1) * 3000;
        console.warn(`Yahoo Finance 429 rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(backoff);
        continue;
      }
      throw e;
    }
  }
  throw new Error('Unreachable');
}

/**
 * v3 historical/chart expects date strings (YYYY-MM-DD), not Date objects.
 * Convert any Date instances in period1/period2 options automatically.
 */
function coerceDateOptions(method: string, args: any[]): any[] {
  if ((method === 'historical' || method === 'chart') && args[1]) {
    const opts = { ...args[1] };
    if (opts.period1 instanceof Date) opts.period1 = opts.period1.toISOString().split('T')[0];
    if (opts.period2 instanceof Date) opts.period2 = opts.period2.toISOString().split('T')[0];
    return [args[0], opts, ...args.slice(2)];
  }
  return args;
}

/**
 * Returns a rate-limited proxy around yahoo-finance2 v3 instance.
 * All method calls are throttled, retried on 429 errors,
 * and Date objects in historical options are auto-coerced to strings.
 */
export async function getYahooFinance(): Promise<any> {
  const yf = await getRawYahooFinance();

  return new Proxy(yf, {
    get(target, prop) {
      const val = target[prop];
      if (typeof val === 'function') {
        return (...args: any[]) => {
          const coerced = coerceDateOptions(String(prop), args);
          return withRetry(() => val.apply(target, coerced));
        };
      }
      return val;
    },
  });
}
