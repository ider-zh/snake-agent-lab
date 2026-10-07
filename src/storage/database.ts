import { validateResults } from '../experiments/import';
import { validateReplay } from './replay';
import { assertRecord, stringifyBoundedJSON, parseBoundedJSON } from './validation';

export type RecordKind = 'replay' | 'result' | 'checkpoint' | 'model';
export interface StoredRecordSummary { id: string; kind: RecordKind; updatedAt: string; bytes: number; }
interface StoredRecord extends StoredRecordSummary { version: 'snake-storage-v1'; key: string; json: string; }
export class StorageError extends Error {
  constructor(message: string, public readonly reason: 'unavailable' | 'quota' | 'failed' | 'corrupt') { super(message); this.name = 'StorageError'; }
}
export const MAX_CHECKPOINT_STORAGE_BYTES = 128 * 1024 * 1024;
const STORE = 'records';
function validateKind(kind: RecordKind): void { if (!['replay', 'result', 'checkpoint', 'model'].includes(kind)) throw new Error('Unsupported record kind'); }
function recordKey(kind: RecordKind, id: string): string {
  validateKind(kind);
  if (typeof id !== 'string' || !id.trim() || id.length > 160) throw new Error('Record ID must contain 1–160 characters');
  return `${kind}:${id}`;
}
function storageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) return new StorageError('Browser storage is full. Export your data, then remove old saved records or free space and retry. Nothing was saved.', 'quota');
  return new StorageError(`Could not save or load browser data. Export a file backup and retry. ${error instanceof Error ? error.message : ''}`.trim(), 'failed');
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new StorageError('Persistent browser storage is unavailable. Export a file backup instead.', 'unavailable')); return; }
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open('snake-agent-lab', 2); } catch (error) { reject(storageError(error)); return; }
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE) ? request.transaction!.objectStore(STORE) : request.result.createObjectStore(STORE, {keyPath: 'key'});
      if (!store.indexNames.contains('metadata')) store.createIndex('metadata', ['kind', 'id', 'updatedAt', 'bytes']);
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => reject(new StorageError('Storage update is blocked by another SnakeLab tab. Close the other tab and retry.', 'unavailable'));
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(STORE, mode); } catch (error) { db.close(); reject(storageError(error)); return; }
    let result: T;
    try { const request = action(tx.objectStore(STORE)); request.onsuccess = () => { result = request.result; }; request.onerror = () => { /* transaction abort handles failure */ }; }
    catch (error) { db.close(); reject(storageError(error)); return; }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(storageError(tx.error)); };
    tx.onabort = () => { db.close(); reject(storageError(tx.error)); };
  });
}
function validatePayload(kind: RecordKind, data: unknown): unknown {
  assertRecord(data, 'Saved data');
  if (typeof data.version !== 'string' || !data.version || data.version.length > 100) throw new Error('Saved data must declare a schema version');
  if (kind === 'replay') return validateReplay(data);
  if (kind === 'result') return validateResults(data);
  // Checkpoint-specific network/shape validation belongs to the owning trainer before restore.
  return data;
}
export async function saveRecord(kind: RecordKind, id: string, data: unknown): Promise<void> {
  const key = recordKey(kind, id);
  const validated = validatePayload(kind, data);
  const json = stringifyBoundedJSON(validated, false, kind === 'checkpoint' ? MAX_CHECKPOINT_STORAGE_BYTES : undefined);
  const record: StoredRecord = {version: 'snake-storage-v1', key, kind, id, json, updatedAt: new Date().toISOString(), bytes: new TextEncoder().encode(json).byteLength};
  await transaction('readwrite', store => store.put(record));
}
export async function loadRecord<T = unknown>(kind: RecordKind, id: string): Promise<T | undefined> {
  const stored = await transaction<StoredRecord | undefined>('readonly', store => store.get(recordKey(kind, id)) as IDBRequest<StoredRecord | undefined>);
  if (!stored) return undefined;
  try {
    if (stored.version !== 'snake-storage-v1' || stored.kind !== kind || stored.id !== id || typeof stored.json !== 'string') throw new Error('Record envelope is invalid');
    const data = parseBoundedJSON(stored.json, kind === 'checkpoint' ? MAX_CHECKPOINT_STORAGE_BYTES : undefined);
    return validatePayload(kind, data) as T;
  } catch (error) { throw new StorageError(`Saved record failed validation: ${error instanceof Error ? error.message : String(error)}`, 'corrupt'); }
}
export async function listRecords(kind?: RecordKind): Promise<StoredRecordSummary[]> {
  if (kind !== undefined) validateKind(kind);
  const db = await openDatabase();
  // A key-only metadata index avoids deserializing every potentially 128 MB checkpoint to list filenames.
  return new Promise<StoredRecordSummary[]>((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(STORE, 'readonly'); } catch (error) { db.close(); reject(storageError(error)); return; }
    const records: StoredRecordSummary[] = [];
    const request = tx.objectStore(STORE).index('metadata').openKeyCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const [recordKind, id, updatedAt, bytes] = cursor.key as [RecordKind, string, string, number];
      if (!kind || recordKind === kind) records.push({kind: recordKind, id, updatedAt, bytes});
      cursor.continue();
    };
    tx.oncomplete = () => { db.close(); resolve(records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); };
    tx.onerror = () => { db.close(); reject(storageError(tx.error)); };
    tx.onabort = () => { db.close(); reject(storageError(tx.error)); };
  });
}
export async function deleteRecord(kind: RecordKind, id: string): Promise<void> {
  await transaction('readwrite', store => store.delete(recordKey(kind, id)));
}
