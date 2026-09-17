// Embedded 1-click installer scripts (source of truth for in-app download).
// Sumber update Google AI Studio.

export const AISTUDIO_DEFAULT_URL = typeof window !== "undefined" && window.location?.origin
  ? window.location.origin
  : "https://ais-dev-pweobuimlhj7oohblibyuh-754954417035.asia-southeast1.run.app";

export const getBootstrapPiSh = (baseUrl = AISTUDIO_DEFAULT_URL) => `#!/usr/bin/env bash
set -e
# Install Grand Aceh POS LANGSUNG dari Google AI Studio / Google Cloud.
BASE_URL="\${AISTUDIO_URL:-${baseUrl}}"
APP_DIR="\${APP_DIR:-$HOME/grand-aceh-pos}"

echo "=== Bootstrap Grand Aceh POS (Raspberry Pi / Google AI Studio) ==="
echo "Sumber : $BASE_URL"
echo "Folder : $APP_DIR"
echo

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "Memasang Docker (butuh internet)..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  sudo systemctl enable docker 2>/dev/null || true
  echo "[OK] Docker terpasang."
fi

# 2. Unduh kode terbaru dari Google AI Studio
mkdir -p "$APP_DIR"
echo "Mengunduh kode dari Google AI Studio..."
curl -fsSL -o /tmp/pos-grand.tar.gz "$BASE_URL/pos-grand.tar.gz"
tar xzf /tmp/pos-grand.tar.gz -C "$APP_DIR"
rm -f /tmp/pos-grand.tar.gz

# 3. Jalankan installer
cd "$APP_DIR"
chmod +x install-pi.sh update-aistudio-pi.sh update-pi.sh restart-pi.sh backup-pi.sh restore-pi.sh setup-autobackup-pi.sh backup-to-cloud.sh 2>/dev/null || true
echo "Menjalankan installer..."
sudo ./install-pi.sh
`;

export const BOOTSTRAP_PI_SH = getBootstrapPiSh();

export const getBootstrapWindowsBat = (baseUrl = AISTUDIO_DEFAULT_URL) => `@echo off
setlocal
set BASE_URL=%AISTUDIO_URL%
if "%BASE_URL%"=="" set BASE_URL=${baseUrl}
set APP_DIR=grand-aceh-pos
echo ============================================
echo   Grand Aceh Kuliner POS - Bootstrap Windows
echo   Sumber: Google AI Studio
echo ============================================
echo.

where curl >nul 2>nul
if errorlevel 1 (
  echo [ERROR] curl tidak tersedia. Gunakan Windows 10/11 (sudah ada bawaan).
  pause
  exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker belum terpasang. Pasang Docker Desktop dulu:
  echo   https://www.docker.com/products/docker-desktop
  pause
  exit /b 1
)

if not exist "%APP_DIR%" mkdir "%APP_DIR%"
echo Mengunduh kode dari Google AI Studio...
curl -fsSL -o "%APP_DIR%\\pos-grand.tar.gz" "%BASE_URL%/pos-grand.tar.gz"
if errorlevel 1 (
  echo [ERROR] Gagal mengunduh dari Google AI Studio. Cek internet lalu ulangi.
  pause
  exit /b 1
)
tar xzf "%APP_DIR%\\pos-grand.tar.gz" -C "%APP_DIR%"
del "%APP_DIR%\\pos-grand.tar.gz"

echo.
echo Menjalankan installer...
cd /d "%APP_DIR%"
call install-windows.bat
`;

export const BOOTSTRAP_WINDOWS_BAT = getBootstrapWindowsBat();

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

