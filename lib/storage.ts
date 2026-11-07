import type { Preferences } from "./schedule";

export type PushDevice = { token: string; wanted: boolean };

let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("rotina-aprendiz", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("local");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

export async function readPreferences() {
  const db = await openDatabase();
  return new Promise<Preferences | undefined>((resolve, reject) => {
    const request = db.transaction("local").objectStore("local").get("preferences");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePreferences(update: (current: Preferences) => Preferences, defaults: Preferences) {
  const db = await openDatabase();
  return new Promise<Preferences>((resolve, reject) => {
    const transaction = db.transaction("local", "readwrite");
    const store = transaction.objectStore("local");
    const request = store.get("preferences");
    const revision = store.get("push-revision");
    let next: Preferences;
    request.onsuccess = () => {
      next = update(request.result ?? defaults);
      store.put(next, "preferences");
    };
    revision.onsuccess = () => store.put((revision.result ?? 0) + 1, "push-revision");
    transaction.oncomplete = () => resolve(next);
    transaction.onabort = () => reject(transaction.error);
  });
}

function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readPushSnapshot() {
  const db = await openDatabase();
  const store = db.transaction("local").objectStore("local");
  const [device, preferences, revision] = await Promise.all([
    result<PushDevice | undefined>(store.get("push-device")),
    result<Preferences | undefined>(store.get("preferences")),
    result<number | undefined>(store.get("push-revision")),
  ]);
  return { device, preferences, revision: revision ?? 0 };
}

export async function setPushDevice(update: (current: PushDevice | undefined) => PushDevice | undefined) {
  const db = await openDatabase();
  return new Promise<PushDevice | undefined>((resolve, reject) => {
    const transaction = db.transaction("local", "readwrite");
    const store = transaction.objectStore("local");
    const request = store.get("push-device");
    let device: PushDevice | undefined;
    request.onsuccess = () => {
      device = update(request.result);
      if (device) store.put(device, "push-device");
      else store.delete("push-device");
    };
    transaction.oncomplete = () => resolve(device);
    transaction.onabort = () => reject(transaction.error);
  });
}
