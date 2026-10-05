import type { BatchResult } from './types';
import { EXPERIMENT_VERSION } from './types';

export const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
export function exportResultsJSON(result: BatchResult): string {
  if (result.version !== EXPERIMENT_VERSION) throw new Error('Unsupported result version');
  const json = JSON.stringify(result, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Results contain a non-finite number');
    return value;
  });
  if (new TextEncoder().encode(json).byteLength > MAX_EXPORT_BYTES) throw new Error('Result export exceeds the 10 MB limit; reduce the batch size');
  return json;
}
export function escapeCSV(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Quoting alone does not prevent spreadsheet formula injection.
  if (/^[\s]*[=+@-]/.test(text) && typeof value !== 'number') text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function exportResultsCSV(result: BatchResult): string {
  const columns = ['protocolId','initializationGroup','agentId','seed','policySeed','score','length','availableCells','fillRate','steps','terminated','truncated','reason','success','finalHash','elapsedMs','decisionCount','measuredDecisionCount','decisionLatencyMeanMs','decisionLatencyP50Ms','decisionLatencyP95Ms','latencySamplesDropped','timeoutCount','fallbackCount','fallbackDecisionMs','timeoutDecisionMs','expandedNodes','stepsPerFood'] as const;
  const csv = [columns.join(','), ...result.rows.map(row => columns.map(column => escapeCSV(row[column])).join(','))].join('\r\n');
  if (new TextEncoder().encode(csv).byteLength > MAX_EXPORT_BYTES) throw new Error('CSV export exceeds the 10 MB limit');
  return csv;
}
