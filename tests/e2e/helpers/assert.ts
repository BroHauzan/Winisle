/**
 * Standard zero-dependency assertion library for WinIsle E2E tests.
 * Compatible with Deno and Node environments.
 */

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assert(condition: unknown, msg = 'Assertion failed'): asserts condition {
  if (!condition) {
    throw new AssertionError(msg);
  }
}

function deepEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (!deepEqual(actual, expected)) {
    const defaultMsg = `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    throw new AssertionError(msg ? `${msg} - ${defaultMsg}` : defaultMsg);
  }
}

export function assertNotEquals<T>(actual: T, expected: T, msg?: string): void {
  if (actual === expected) {
    const defaultMsg = `Expected value to differ from ${JSON.stringify(expected)}`;
    throw new AssertionError(msg ? `${msg} - ${defaultMsg}` : defaultMsg);
  }
}

export function assertAlmostEquals(actual: number, expected: number, tolerance = 1e-4, msg?: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    const defaultMsg = `Expected ${expected} (±${tolerance}), got ${actual}`;
    throw new AssertionError(msg ? `${msg} - ${defaultMsg}` : defaultMsg);
  }
}

export function assertMatch(actual: string, regexp: RegExp, msg?: string): void {
  if (!regexp.test(actual)) {
    const defaultMsg = `Expected string "${actual}" to match ${regexp}`;
    throw new AssertionError(msg ? `${msg} - ${defaultMsg}` : defaultMsg);
  }
}

export function assertStringIncludes(actual: string, searchString: string, msg?: string): void {
  if (!actual.includes(searchString)) {
    const defaultMsg = `Expected "${actual}" to include "${searchString}"`;
    throw new AssertionError(msg ? `${msg} - ${defaultMsg}` : defaultMsg);
  }
}

export function assertThrows(fn: () => unknown, msg?: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new AssertionError(msg ? `${msg} - Expected function to throw` : 'Expected function to throw');
  }
}

export async function assertRejects(fn: () => Promise<unknown>, msg?: string): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new AssertionError(msg ? `${msg} - Expected async function to reject` : 'Expected async function to reject');
  }
}
