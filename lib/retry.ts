/**
 * Retry an async operation with exponential backoff.
 *
 * Defaults: 4 attempts, 500ms initial delay → ~ 7s total wall clock at worst
 * (500 + 1000 + 2000 + 4000ms). Plenty for transient API blips without
 * keeping the Vercel function alive too long.
 */
export async function retry<T>(
  label: string,
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = i === attempts - 1;
      if (isLast) break;
      const delay = baseDelayMs * Math.pow(2, i);
      console.warn(
        `[retry:${label}] attempt ${i + 1}/${attempts} failed, retrying in ${delay}ms`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.error(`[retry:${label}] all ${attempts} attempts failed`, lastError);
  throw lastError;
}
