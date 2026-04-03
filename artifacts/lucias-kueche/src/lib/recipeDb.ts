import type { Recipe } from "@/types/recipe";

const DB_NAME = "lucias-kueche";
const DB_VERSION = 2;
const FILTER_STORE = "recipesByFilter";
const META_STORE = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (event.oldVersion < 2) {
        if (db.objectStoreNames.contains("recipes")) {
          db.deleteObjectStore("recipes");
        }
        if (!db.objectStoreNames.contains(FILTER_STORE)) {
          db.createObjectStore(FILTER_STORE, { keyPath: "_key" });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

type StoredRecipe = Recipe & { _key: string; _filter: string };

function makeKey(filter: string, id: number): string {
  return `${filter}:${id}`;
}

export async function getCachedRecipes(filter: string): Promise<Recipe[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(FILTER_STORE, "readonly");
    const store = tx.objectStore(FILTER_STORE);
    return await new Promise<Recipe[]>((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as StoredRecipe[]) ?? [];
        const filtered = all
          .filter((r) => r._filter === filter)
          .map(({ _key: _k, _filter: _f, ...rest }) => rest as Recipe);
        resolve(filtered);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function setCachedRecipes(filter: string, recipes: Recipe[]): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([FILTER_STORE, META_STORE], "readwrite");
    const recipeStore = tx.objectStore(FILTER_STORE);
    const metaStore = tx.objectStore(META_STORE);

    await new Promise<void>((resolve) => {
      const getAllReq = recipeStore.getAll();
      getAllReq.onsuccess = () => {
        const existing = (getAllReq.result as StoredRecipe[]) ?? [];
        const otherEntries = existing.filter((r) => r._filter !== filter);

        const clearReq = recipeStore.clear();
        clearReq.onsuccess = () => {
          for (const r of otherEntries) {
            recipeStore.put(r);
          }
          for (const r of recipes) {
            recipeStore.put({ ...r, _key: makeKey(filter, r.id), _filter: filter });
          }
          metaStore.put(Date.now(), `lastSync_${filter}`);
        };
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
  }
}

export async function deleteCachedRecipe(id: number): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(FILTER_STORE, "readwrite");
    const store = tx.objectStore(FILTER_STORE);

    await new Promise<void>((resolve) => {
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const all = (getAllReq.result as StoredRecipe[]) ?? [];
        for (const r of all) {
          if (r.id === id) {
            store.delete(r._key);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
  }
}

export async function clearRecipeCache(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([FILTER_STORE, META_STORE], "readwrite");

    await new Promise<void>((resolve) => {
      tx.objectStore(FILTER_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
  }
}
