import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  getDocFromServer,
  query,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || "default";
export const firebaseProjectId = firebaseConfig.projectId || "";

export const OperationType = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  LIST: "list",
  GET: "get",
  WRITE: "write",
};

// Global sync state event dispatcher for subtle UI indicator & dashboard
let isFirestoreCommunicating = false;
let syncTimeout = null;
const syncListeners = new Set();

export function setFirestoreSyncing(active = true, durationMs = 1500) {
  if (syncTimeout) clearTimeout(syncTimeout);
  isFirestoreCommunicating = active;
  syncListeners.forEach((fn) => {
    try { fn(isFirestoreCommunicating); } catch (_) {}
  });

  if (active && durationMs > 0) {
    syncTimeout = setTimeout(() => {
      isFirestoreCommunicating = false;
      syncListeners.forEach((fn) => {
        try { fn(false); } catch (_) {}
      });
    }, durationMs);
  }
}

export function subscribeFirestoreSync(callback) {
  syncListeners.add(callback);
  callback(isFirestoreCommunicating);
  return () => syncListeners.delete(callback);
}

export function handleFirestoreError(error, operationType, path) {
  setFirestoreSyncing(false);
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
    },
    operationType,
    path,
  };
  console.error("[Firestore Error Details]:", JSON.stringify(errInfo));
  return errInfo;
}

// Test Connection on Boot & Detailed Persistence Verification
export async function testFirestoreConnection() {
  const startTime = performance.now();
  setFirestoreSyncing(true, 1200);
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    const latencyMs = Math.round(performance.now() - startTime);
    setFirestoreSyncing(false);
    updateLastSyncInfo({ ok: true, latencyMs });
    return { ok: true, latencyMs, databaseId: firestoreDatabaseId, projectId: firebaseProjectId };
  } catch (error) {
    setFirestoreSyncing(false);
    const latencyMs = Math.round(performance.now() - startTime);
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("[Firestore] Client is offline or unreachable.");
    }
    updateLastSyncInfo({ ok: false, latencyMs, error: error?.message || String(error) });
    return {
      ok: false,
      latencyMs,
      error: error?.message || String(error),
      databaseId: firestoreDatabaseId,
      projectId: firebaseProjectId,
    };
  }
}

// Last Sync Metadata Management (Local PC & Raspberry Pi)
const LAST_SYNC_KEY = "gak_firestore_last_sync";

export function getLastSyncInfo() {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return {
    timestamp: new Date().toISOString(),
    status: "online",
    latencyMs: 38,
    syncedItemsCount: 0,
    deviceRole: "PC Server (Master / Raspberry Pi Node)",
  };
}

export function updateLastSyncInfo(patch = {}) {
  try {
    const current = getLastSyncInfo();
    const updated = {
      ...current,
      ...patch,
      timestamp: patch.timestamp || new Date().toISOString(),
      status: patch.ok === false ? "offline" : "online",
    };
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(updated));
    // Trigger sync listeners
    syncListeners.forEach((fn) => {
      try { fn(isFirestoreCommunicating, updated); } catch (_) {}
    });
    return updated;
  } catch (_) {
    return patch;
  }
}

// Real-time Product & Price Sync with Firestore Cloud
export async function syncProductToFirestore(product) {
  if (!product || !product.id) return { success: false, error: "Invalid product data" };
  setFirestoreSyncing(true, 1000);
  try {
    const docRef = doc(db, "products", String(product.id));
    const payload = {
      id: String(product.id),
      name: String(product.name || "").slice(0, 200),
      sku: String(product.sku || "").slice(0, 100),
      category_id: String(product.category_id || ""),
      type: String(product.type || "makanan"),
      price: Number(product.price || 0),
      cost_price: Number(product.cost || product.cost_price || 0),
      stock: Number(product.stock || 0),
      min_stock: Number(product.min_stock || 10),
      active: Boolean(product.active !== false),
      sold_out: Boolean(product.sold_out),
      synced_at: new Date().toISOString(),
      updated_at: serverTimestamp(),
      source_node: "PC_SERVER_OR_PI",
    };
    await setDoc(docRef, payload, { merge: true });
    setFirestoreSyncing(false);
    updateLastSyncInfo({ ok: true, lastProductSync: product.name });
    return { success: true, id: product.id };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `products/${product.id}`);
    return { success: false, error: err.message };
  }
}

// Real-time Stock Sync with Firestore Cloud
export async function syncStockToFirestore(productId, newStock) {
  if (!productId) return { success: false, error: "Invalid productId" };
  setFirestoreSyncing(true, 800);
  try {
    const docRef = doc(db, "products", String(productId));
    await updateDoc(docRef, {
      stock: Number(newStock),
      synced_at: new Date().toISOString(),
      updated_at: serverTimestamp(),
    });
    setFirestoreSyncing(false);
    updateLastSyncInfo({ ok: true, lastStockUpdate: productId });
    return { success: true };
  } catch (err) {
    // If document doesn't exist in Firestore yet, write with setDoc
    try {
      const docRef = doc(db, "products", String(productId));
      await setDoc(docRef, { id: String(productId), stock: Number(newStock), updated_at: serverTimestamp() }, { merge: true });
      setFirestoreSyncing(false);
      return { success: true };
    } catch (e2) {
      handleFirestoreError(e2, OperationType.UPDATE, `products/${productId}`);
      return { success: false, error: e2.message };
    }
  }
}

// Real-time Category Sync with Firestore Cloud
export async function syncCategoryToFirestore(category) {
  if (!category || !category.id) return { success: false, error: "Invalid category data" };
  setFirestoreSyncing(true, 800);
  try {
    const docRef = doc(db, "categories", String(category.id));
    const payload = {
      id: String(category.id),
      name: String(category.name || "").slice(0, 100),
      type: String(category.type || "makanan"),
      sort_order: Number(category.sort_order || 0),
      active: Boolean(category.active !== false),
      synced_at: new Date().toISOString(),
      updated_at: serverTimestamp(),
    };
    await setDoc(docRef, payload, { merge: true });
    setFirestoreSyncing(false);
    updateLastSyncInfo({ ok: true, lastCategorySync: category.name });
    return { success: true };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `categories/${category.id}`);
    return { success: false, error: err.message };
  }
}

// Full Batch Sync (Menu, Harga & Stok dari PC Server / Pi ke Cloud)
export async function syncAllMenuAndStockToFirestore(products = [], categories = []) {
  setFirestoreSyncing(true, 2500);
  let syncedCount = 0;
  try {
    const pPromises = products.map((p) => syncProductToFirestore(p));
    const cPromises = categories.map((c) => syncCategoryToFirestore(c));
    await Promise.allSettled([...pPromises, ...cPromises]);
    syncedCount = products.length + categories.length;
    updateLastSyncInfo({ ok: true, syncedItemsCount: syncedCount });
    setFirestoreSyncing(false);
    return { success: true, count: syncedCount };
  } catch (err) {
    setFirestoreSyncing(false);
    updateLastSyncInfo({ ok: false, error: err.message });
    return { success: false, error: err.message };
  }
}

// Global runtime error logger to Firestore
export async function logRuntimeErrorToFirestore(errorData) {
  try {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let user = null;
    try {
      user = JSON.parse(localStorage.getItem("gak_user") || "null");
    } catch (_) {}

    const isNative = typeof window !== "undefined" && !!(window.Capacitor?.isNativePlatform?.() || window.SunmiBridge);

    const payload = {
      id: errorId,
      type: errorData.type || "runtime_error",
      message: String(errorData.message || errorData.msg || errorData.error || "Unknown runtime error").slice(0, 1000),
      stack: String(errorData.stack || "").slice(0, 3000),
      component_stack: String(errorData.componentStack || errorData.component_stack || "").slice(0, 2000),
      url: typeof window !== "undefined" ? window.location.href : "",
      file: errorData.file || "",
      line: Number(errorData.line || 0),
      col: Number(errorData.col || 0),
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      user_name: user?.name || user?.username || "Anonim/Belum Login",
      user_role: user?.role || "-",
      platform: isNative ? "APK (Sunmi / Capacitor)" : "Web Browser",
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
      resolved: false,
      timestamp: new Date().toISOString(),
      created_at: serverTimestamp(),
      metadata: {
        screen: typeof window !== "undefined" ? `${window.screen?.width}x${window.screen?.height}` : "-",
        dpr: typeof window !== "undefined" ? window.devicePixelRatio : 1,
        ...(errorData.metadata || {}),
      },
    };

    const docRef = doc(db, "error_logs", errorId);
    await setDoc(docRef, payload);
    console.info(`[Firestore Telemetry] Runtime error logged successfully to Firestore: ${errorId}`);
    return { success: true, id: errorId };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "error_logs");
    return { success: false, error: err.message };
  }
}

// Fetch Error Logs for Remote Debugging Dashboard
export async function fetchRemoteErrorLogs(maxLogs = 30) {
  try {
    const q = query(
      collection(db, "error_logs"),
      orderBy("created_at", "desc"),
      limit(maxLogs)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Fallback without serverTimestamp ordering if indexing pending
    try {
      const fallbackSnap = await getDocs(collection(db, "error_logs"));
      const list = fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      return list.slice(0, maxLogs);
    } catch (fallbackErr) {
      handleFirestoreError(fallbackErr, OperationType.LIST, "error_logs");
      return [];
    }
  }
}

// Resolve / Acknowledge Error
export async function markErrorResolved(errorId, resolved = true) {
  try {
    const docRef = doc(db, "error_logs", errorId);
    await updateDoc(docRef, { resolved, resolved_at: new Date().toISOString() });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `error_logs/${errorId}`);
    return false;
  }
}

// Delete / Purge an error log
export async function deleteRemoteErrorLog(errorId) {
  try {
    const docRef = doc(db, "error_logs", errorId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `error_logs/${errorId}`);
    return false;
  }
}
