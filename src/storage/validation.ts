export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function assertRecord(value: unknown, label = 'Data'): asserts value is Record<string, unknown> {
  if (!isRecord(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error(`${label} must be a plain object`);
}
export function assertKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label} has an unsupported field: ${key}`);
}
export function finiteInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return value;
}
/** Reject executable values, remote model payloads masquerading as classes, cycles and non-finite numbers. */
export function validateJSONData(value: unknown): void {
  const seen = new Set<object>();
  let count = 0;
  function visit(item: unknown, depth: number): void {
    if (++count > 1000000 || depth > 32) throw new Error('Data is too complex');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') { if (!Number.isFinite(item)) throw new Error('Data contains a non-finite number'); return; }
    if (typeof item !== 'object') throw new Error('Only JSON data values are supported');
    if (seen.has(item)) throw new Error('Data contains a cycle or repeated object reference');
    seen.add(item);
    if (Array.isArray(item)) { for (const element of item) visit(element, depth + 1); }
    else {
      assertRecord(item);
      for (const [key, element] of Object.entries(item)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('Unsafe object key');
        visit(element, depth + 1);
      }
    }
    seen.delete(item);
  }
  visit(value, 0);
}
export function parseBoundedJSON(text: string, maxBytes = MAX_IMPORT_BYTES): unknown {
  if (typeof text !== 'string' || text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`Import exceeds the ${maxBytes / 1024 / 1024} MB limit`);
  let data: unknown;
  try { data = JSON.parse(text) as unknown; } catch { throw new Error('File is not valid JSON'); }
  validateJSONData(data);
  return data;
}
export function stringifyBoundedJSON(data: unknown, pretty = false, maxBytes = MAX_IMPORT_BYTES): string {
  validateJSONData(data);
  const text = JSON.stringify(data, null, pretty ? 2 : undefined);
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`Data exceeds the ${maxBytes / 1024 / 1024} MB storage/export limit`);
  return text;
}
