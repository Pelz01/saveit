// ──────────────────────────────────────────
// Firebase Admin — Server-side Firestore
// ──────────────────────────────────────────

import admin from "firebase-admin";

let db: admin.firestore.Firestore | null = null;
let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return;
  initialized = true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!projectId) {
    console.warn("[Firebase Admin] No FIREBASE_PROJECT_ID — Firestore disabled");
    return;
  }

  try {
    if (keyPath) {
      // Use service account key file
      const serviceAccount = require(keyPath.startsWith("/")
        ? keyPath
        : `${process.cwd()}/${keyPath}`);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      // Fallback: project ID only (works in GCP environments)
      admin.initializeApp({
        projectId,
      });
    }

    db = admin.firestore();
    console.log("[Firebase Admin] Connected to Firestore");
  } catch (err: any) {
    console.warn("[Firebase Admin] Init failed:", err.message);
  }
}

// Initialize on import
initFirebaseAdmin();

/**
 * Save or update a Telegram user in Firestore
 */
export async function saveTelegramUser(telegramUser: {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}) {
  if (!db) return;

  const docId = `tg_${telegramUser.id}`;
  const userRef = db.collection("users").doc(docId);
  const doc = await userRef.get();

  const userData: any = {
    source: "telegram",
    telegramId: telegramUser.id,
    displayName:
      [telegramUser.first_name, telegramUser.last_name]
        .filter(Boolean)
        .join(" ") || "Unknown",
    username: telegramUser.username || null,
    lastDownload: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!doc.exists) {
    userData.firstSeen = admin.firestore.FieldValue.serverTimestamp();
    userData.downloadCount = 0;
  }

  await userRef.set(userData, { merge: true });
}

/**
 * Increment a Telegram user's download count
 */
export async function incrementTelegramDownloads(telegramId: number) {
  if (!db) return;

  const docId = `tg_${telegramId}`;
  await db
    .collection("users")
    .doc(docId)
    .update({
      downloadCount: admin.firestore.FieldValue.increment(1),
      lastDownload: admin.firestore.FieldValue.serverTimestamp(),
    });
}
