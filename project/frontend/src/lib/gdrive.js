import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

// Inisialisasi Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Provider Google dengan scope Google Drive
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");
provider.addScope("https://www.googleapis.com/auth/drive.appdata");
provider.addScope("https://www.googleapis.com/auth/drive");
provider.setCustomParameters({ prompt: "select_account" });

// In-memory token storage (MANDATORY security practice)
let cachedAccessToken = null;
let isSigningIn = false;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess,
  onAuthFailure
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // User logged into Firebase session but accessToken needs user re-auth or is cached
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Google Sign-In with popup
export const googleSignIn = async () => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Gagal memperoleh token akses Google Drive.");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error("[GDrive Auth Error]:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = () => cachedAccessToken;

export const setCachedAccessToken = (token) => {
  cachedAccessToken = token;
};

export const googleLogout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// ==========================================
// Google Drive API Helpers
// ==========================================
const DRIVE_FOLDER_NAME = "Grand Aceh POS Backups";

// Cari atau buat folder "Grand Aceh POS Backups" di root Google Drive
export async function getOrCreateBackupFolder(accessToken) {
  const token = accessToken || cachedAccessToken;
  if (!token) throw new Error("Akses token Google Drive tidak ditemukan. Silakan masuk dengan Google.");

  // Cari folder yang sudah ada
  const query = encodeURIComponent(
    `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal mencari folder Google Drive (${searchRes.status})`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Buat folder baru
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      description: "Cadangan otomatis database Grand Aceh Kuliner POS",
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || "Gagal membuat folder di Google Drive.");
  }

  const createdFolder = await createRes.json();
  return createdFolder.id;
}

// Daftar file backup dari Google Drive
export async function listDriveBackups(accessToken) {
  const token = accessToken || cachedAccessToken;
  if (!token) throw new Error("Akses token Google Drive tidak ditemukan.");

  const folderId = await getOrCreateBackupFolder(token);
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,size,createdTime,modifiedTime,webContentLink,description)&orderBy=createdTime desc&pageSize=50`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Gagal mengambil daftar backup dari Google Drive.");
  }

  const data = await res.json();
  return data.files || [];
}

// Upload file backup (.zip) ke Google Drive
export async function uploadBackupToDrive(blob, filename, description = "", accessToken = null) {
  const token = accessToken || cachedAccessToken;
  if (!token) throw new Error("Akses token Google Drive tidak ditemukan.");

  const folderId = await getOrCreateBackupFolder(token);

  const metadata = {
    name: filename || `gak-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`,
    parents: [folderId],
    description: description || `Backup server POS pada ${new Date().toLocaleString("id-ID")}`,
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", blob);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Gagal mengunggah file backup ke Google Drive.");
  }

  const result = await res.json();
  return result;
}

// Download file backup dari Google Drive sebagai Blob
export async function downloadBackupFromDrive(fileId, accessToken = null) {
  const token = accessToken || cachedAccessToken;
  if (!token) throw new Error("Akses token Google Drive tidak ditemukan.");

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Gagal mengunduh file dari Google Drive.");
  }

  return await res.blob();
}

// Hapus file backup dari Google Drive
export async function deleteBackupFromDrive(fileId, accessToken = null) {
  const token = accessToken || cachedAccessToken;
  if (!token) throw new Error("Akses token Google Drive tidak ditemukan.");

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Gagal menghapus file dari Google Drive.");
  }

  return true;
}

// Penyimpanan konfigurasi jadwal backup lokal
const SCHEDULE_KEY = "gak_gdrive_backup_schedule";

export function getDriveSchedule() {
  try {
    const s = localStorage.getItem(SCHEDULE_KEY);
    if (s) return JSON.parse(s);
  } catch (e) {}
  return {
    enabled: true,
    frequency: "daily", // "daily" (23:00), "hourly_6" (setiap 6 jam), "shift_close", "weekly"
    dailyTime: "23:00",
    lastBackupAt: null,
    lastBackupFile: null,
    lastStatus: "ready",
    maxRetention: 15, // simpan max 15 backup terakhir di drive
  };
}

export function saveDriveSchedule(schedule) {
  try {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
  } catch (e) {}
}
