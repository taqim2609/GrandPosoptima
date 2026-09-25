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

export const START_PC_SERVER_BAT = `@echo off
setlocal enabledelayedexpansion
title Grand POS PC Server + Evolution API + Auto-Tailscale
cls
echo ====================================================================
echo   MEMULAI GRAND POS SERVER + EVOLUTION API (AUTO DETECT TAILSCALE)
echo ====================================================================
echo.

:: 1. Auto-Detect Alamat IP Tailscale PC
echo [*] Mendeteksi alamat IP Tailscale di PC ini...
set "TAILSCALE_IP="

for /f "tokens=*" %%a in ('tailscale ip -4 2^>nul') do (
    if not defined TAILSCALE_IP (
        set "TAILSCALE_IP=%%a"
    )
)

if defined TAILSCALE_IP (
    echo [V] Tailscale Terdeteksi! IP PC Anda: !TAILSCALE_IP!
    set "EVOLUTION_HOST_URL=http://!TAILSCALE_IP!:8080"
) else (
    echo [!] Tailscale tidak aktif atau belum login. Menggunakan localhost/LAN.
    set "TAILSCALE_IP=127.0.0.1"
    set "EVOLUTION_HOST_URL=http://localhost:8080"
)
echo.

:: 2. Cek apakah Docker sudah berjalan
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] PERINGATAN: Docker Desktop belum aktif.
    echo [*] Silakan buka Docker Desktop terlebih dahulu, lalu jalankan file ini lagi.
    echo.
    pause
    exit /b
)

:: 3. Jalankan Container Evolution API secara Otomatis
echo [*] Memeriksa status Evolution API container...
docker inspect grandpos_evolution_api >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Menyalakan container Evolution API yang sudah ada...
    docker start grandpos_evolution_api >nul 2>&1
) else (
    echo [*] Mengunduh & membuat container Evolution API pertama kali...
    docker run -d ^
      --name grandpos_evolution_api ^
      --restart always ^
      -p 8080:8080 ^
      -e SERVER_URL=http://localhost:8080 ^
      -e AUTHENTICATION_API_KEY=GrandAcehSecretKey2026 ^
      -e LOG_LEVEL=ERROR,WARN,INFO ^
      -e DATABASE_PROVIDER=local ^
      -e DEL_INSTANCE=false ^
      -v grandpos_evolution_data:/evolution/instances ^
      atendai/evolution-api:v2.1.1
)

echo [V] Evolution API AKTIF di Port 8080.
echo.
echo ====================================================================
echo               INFORMASI KONEKSI (AUTO-CONFIG)
echo ====================================================================
echo  Alamat IP Tailscale PC : %TAILSCALE_IP%
echo  Evolution URL Lokal    : http://localhost:8080
echo  Evolution URL Jaringan : %EVOLUTION_HOST_URL%
echo  API Key                : GrandAcehSecretKey2026
echo ====================================================================
echo.

:: 4. Pasang Environment Variable & Jalankan Server POS
set "TAILSCALE_PC_IP=%TAILSCALE_IP%"
set "EVOLUTION_API_URL=%EVOLUTION_HOST_URL%"
set "EVOLUTION_API_KEY=GrandAcehSecretKey2026"
set "PORT=3000"

echo [*] Menjalankan Server POS (Port 3000)...
npm start

pause
`;

export const SETUP_RASPBERRYPI_SH = `#!/bin/bash
set -e

echo "========================================================"
echo "    MEMULAI SETUP GRAND POS DI RASPBERRY PI (RINGAN)"
echo "========================================================"

# 1. Update sistem & Install Node.js
echo "[1/4] Menginstal Node.js runtime..."
sudo apt-get update
sudo apt-get install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install Tailscale
echo "[2/4] Menginstal Tailscale VPN..."
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
sudo tailscale up --accept-dns=true

# 3. Download / Setup POS App
echo "[3/4] Mengunduh dependencies aplikasi POS..."
npm install --production

# 4. Buat Autostart Systemd Service (Otomatis nyala saat Raspberry Pi dinyalakan)
echo "[4/4] Membuat service background otomatis (systemd)..."
sudo bash -c "cat << 'EOF' > /etc/systemd/system/grandpos.service
[Unit]
Description=Grand POS Client Raspberry Pi
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=PORT=3000
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable grandpos
sudo systemctl start grandpos

echo "========================================================"
echo " SUKSES! Grand POS di Raspberry Pi sudah aktif otomatis."
echo " Akses POS di browser: http://localhost:3000"
echo " IP Tailscale Pi: \$(tailscale ip -4)"
echo "========================================================"
`;

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

