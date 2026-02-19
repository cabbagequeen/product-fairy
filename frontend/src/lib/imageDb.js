import { openDB } from 'idb';

const DB_NAME = 'product-fairy';
const STORE_NAME = 'images';
const DB_VERSION = 1;

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'filename' });
      }
    },
  });
}

/** Upsert a single image by filename. */
export async function saveImage(image) {
  const db = await getDb();
  await db.put(STORE_NAME, image);
}

/** Return all stored images. */
export async function loadAllImages() {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

/** Replace a single image (used for regeneration). */
export async function replaceImage(filename, newImage) {
  const db = await getDb();
  await db.put(STORE_NAME, { ...newImage, filename });
}

/** Delete all images (used for "Start New"). */
export async function clearAllImages() {
  const db = await getDb();
  await db.clear(STORE_NAME);
}
