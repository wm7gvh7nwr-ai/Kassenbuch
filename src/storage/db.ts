import type { Budget, Data, Entry, Pot, PotBudget } from '../core/model';
import { SCHEMA_VERSION } from '../core/model';

/**
 * Dünne Hülle um IndexedDB. Alles bleibt im Gerät.
 * Store «entries»: eine Buchung pro Eintrag (Schlüssel = id).
 * Store «meta»: budgets, pots, potBudgets, schemaVersion, lastBackupAt.
 */
const DB_NAME = 'kassenbuch';
const DB_VERSION = 1;

export interface Meta {
  budgets: Budget[];
  lastBackupAt: string | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Die Datenbank ist blockiert. Bitte die App schliessen und neu öffnen.'));
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Speichern abgebrochen'));
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAll(): Promise<Data & Meta> {
  const db = await open();
  const tx = db.transaction(['entries', 'meta'], 'readonly');
  const meta = tx.objectStore('meta');
  const [entries, budgets, pots, potBudgets, lastBackupAt] = await Promise.all([
    result(tx.objectStore('entries').getAll() as IDBRequest<Entry[]>),
    result(meta.get('budgets') as IDBRequest<Budget[] | undefined>),
    result(meta.get('pots') as IDBRequest<Pot[] | undefined>),
    result(meta.get('potBudgets') as IDBRequest<PotBudget[] | undefined>),
    result(meta.get('lastBackupAt') as IDBRequest<string | undefined>),
  ]);
  // Daten aus Version 1 haben keine Töpfe: leer beginnen, Buchungen bleiben unverändert
  return { entries, budgets: budgets ?? [], pots: pots ?? [], potBudgets: potBudgets ?? [], lastBackupAt: lastBackupAt ?? null };
}

export async function putEntry(entry: Entry): Promise<void> {
  const db = await open();
  const tx = db.transaction('entries', 'readwrite');
  tx.objectStore('entries').put(entry);
  await done(tx);
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction('entries', 'readwrite');
  tx.objectStore('entries').delete(id);
  await done(tx);
}

export async function saveBudgets(budgets: Budget[]): Promise<void> {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(budgets, 'budgets');
  tx.objectStore('meta').put(SCHEMA_VERSION, 'schemaVersion');
  await done(tx);
}

export async function savePots(pots: Pot[], potBudgets: PotBudget[]): Promise<void> {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(pots, 'pots');
  tx.objectStore('meta').put(potBudgets, 'potBudgets');
  tx.objectStore('meta').put(SCHEMA_VERSION, 'schemaVersion');
  await done(tx);
}

export async function setLastBackup(iso: string): Promise<void> {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(iso, 'lastBackupAt');
  await done(tx);
}

/** Alles in einem Schritt ersetzen (Backup einlesen). Klappt ganz oder gar nicht. */
export async function replaceAll(data: Data): Promise<void> {
  const db = await open();
  const tx = db.transaction(['entries', 'meta'], 'readwrite');
  const store = tx.objectStore('entries');
  store.clear();
  for (const e of data.entries) store.put(e);
  tx.objectStore('meta').put(data.budgets, 'budgets');
  tx.objectStore('meta').put(data.pots, 'pots');
  tx.objectStore('meta').put(data.potBudgets, 'potBudgets');
  tx.objectStore('meta').put(SCHEMA_VERSION, 'schemaVersion');
  await done(tx);
}

/** Alle Daten löschen */
export async function clearAll(): Promise<void> {
  const db = await open();
  const tx = db.transaction(['entries', 'meta'], 'readwrite');
  tx.objectStore('entries').clear();
  tx.objectStore('meta').clear();
  await done(tx);
}
