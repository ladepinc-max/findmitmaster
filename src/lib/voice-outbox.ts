/** WhatsApp-style outbox: voice notes are kept on the phone until they reach Ama. */
export interface QueuedNote {
  id: string;
  blob: Blob;
  mime: string;
  createdAt: number;
}

const DB = "findmit-voice-outbox";
const STORE = "notes";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const queueNote = (n: QueuedNote) => tx("readwrite", (s) => s.put(n));
export const removeNote = (id: string) => tx("readwrite", (s) => s.delete(id));
export const listNotes = async () =>
  ((await tx("readonly", (s) => s.getAll())) as QueuedNote[]).sort((a, b) => a.createdAt - b.createdAt);

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
