// Standalone Google Drive OAuth 2.0 Auth (No Firebase SDK)
const OAUTH_CLIENT_ID = "956375484215-icprobcchq0sjbiiath1lnvdkp8i1cgv.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive";

let cachedAccessToken = null;
let currentUser = null;
let isSigningIn = false;
const authListeners = new Set();

const AUTH_STORAGE_KEY = "gak_gdrive_auth_session";

function notifyAuthListeners() {
  authListeners.forEach((listener) => {
    try {
      if (cachedAccessToken && currentUser) {
        listener.onSuccess?.(currentUser, cachedAccessToken);
      } else {
        listener.onFailure?.();
      }
    } catch (_) {}
  });
}

// Load Google Identity Services (GIS) script dynamically
function loadGisScript() {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    if (window.google?.accounts?.oauth2) {
      return resolve(window.google.accounts.oauth2);
    }
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google?.accounts?.oauth2));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google?.accounts?.oauth2);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess,
  onAuthFailure
) => {
  const listener = { onSuccess: onAuthSuccess, onFailure: onAuthFailure };
  authListeners.add(listener);

  // Check stored session
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.token && parsed.expiresAt > Date.now()) {
        cachedAccessToken = parsed.token;
        currentUser = parsed.user || { displayName: "Google Drive User", email: "drive@grandpos.id" };
        if (onAuthSuccess) onAuthSuccess(currentUser, cachedAccessToken);
        return () => authListeners.delete(listener);
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  } catch (_) {}

  if (onAuthFailure) onAuthFailure();
  return () => authListeners.delete(listener);
};

// Google Sign-In with popup via standard Google Identity Services / OAuth2
export const googleSignIn = async () => {
  if (isSigningIn) return null;
  isSigningIn = true;
  try {
    const oauth2 = await loadGisScript();
    if (oauth2) {
      return await new Promise((resolve, reject) => {
        const tokenClient = oauth2.initTokenClient({
          client_id: OAUTH_CLIENT_ID,
          scope: SCOPES,
          callback: async (resp) => {
            if (resp.error) {
              return reject(new Error(resp.error_description || resp.error));
            }
            cachedAccessToken = resp.access_token;
            let user = {
              displayName: "Google Drive Akun",
              email: "drive@grandpos.id",
              photoURL: "",
            };
            try {
              const uRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${resp.access_token}` },
              });
              if (uRes.ok) {
                const uData = await uRes.json();
                user = {
                  displayName: uData.name || uData.email,
                  email: uData.email,
                  photoURL: uData.picture || "",
                };
              }
            } catch (_) {}
            currentUser = user;
            try {
              localStorage.setItem(
                AUTH_STORAGE_KEY,
                JSON.stringify({
                  token: cachedAccessToken,
                  user,
                  expiresAt: Date.now() + (parseInt(resp.expires_in, 10) || 3600) * 1000,
                })
              );
            } catch (_) {}
            notifyAuthListeners();
            resolve({ user, accessToken: cachedAccessToken });
          },
        });
        tokenClient.requestAccessToken({ prompt: "consent" });
      });
    }

    // Fallback if GIS fails to load: Standalone popup token flow
    return await new Promise((resolve, reject) => {
      const redirectUri = window.location.origin;
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        OAUTH_CLIENT_ID
      )}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=token&scope=${encodeURIComponent(SCOPES)}&prompt=consent`;

      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        authUrl,
        "google_oauth_popup",
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        return reject(new Error("Popup diblokir oleh browser. Izinkan popup untuk login."));
      }

      const timer = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(timer);
            reject(new Error("Login Google dibatalkan."));
            return;
          }
          if (popup.location.href.includes(redirectUri)) {
            const hash = popup.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const token = params.get("access_token");
            if (token) {
              clearInterval(timer);
              popup.close();
              cachedAccessToken = token;
              currentUser = {
                displayName: "Google Drive Terhubung",
                email: "drive@grandpos.id",
              };
              notifyAuthListeners();
              resolve({ user: currentUser, accessToken: cachedAccessToken });
            }
          }
        } catch (_) {
          // Cross-origin before redirect is normal
        }
      }, 500);
    });
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
  cachedAccessToken = null;
  currentUser = null;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (_) {}
  notifyAuthListeners();
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
