import { LayerLabError } from "@/lib/layerlab/store";

/** Guessing PINs and passwords takes time: after a run of wrong tries, that key waits five minutes. */

const attempts = new Map<string, { failures: number; until: number }>();
const ATTEMPT_LIMIT = 8;
const LOCK_MS = 5 * 60 * 1000;

export function checkAttempts(key: string) {
  const entry = attempts.get(key);
  if (entry && entry.until > Date.now()) throw new LayerLabError("Too many wrong tries. Wait five minutes and try again.", 429);
}

export function failedAttempt(key: string) {
  const entry = attempts.get(key) ?? { failures: 0, until: 0 };
  entry.failures += 1;
  if (entry.failures >= ATTEMPT_LIMIT) {
    entry.failures = 0;
    entry.until = Date.now() + LOCK_MS;
  }
  attempts.set(key, entry);
  if (attempts.size > 10000) attempts.clear();
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}
