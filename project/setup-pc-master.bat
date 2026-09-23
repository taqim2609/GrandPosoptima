@echo off
chcp 65001 >nul
title Setup Grand POS - PC Master Server (Tailscale + Evolution API)
echo ======================================================================
echo   GRAND ACEH KULINER POS - SETUP PC MASTER SERVER
echo   Peran: Server Utama, Database, Evolution WhatsApp API Hub
echo ======================================================================
echo.

:: 1. Periksa Tailscale
echo [1/4] Memeriksa koneksi Tailscale di PC ini...
where tailscale >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [PERINGATAN] Tailscale belum terpasang di PC ini!
    echo Silakan download dan install Tailscale dari: https://tailscale.com/download
    echo Setelah di-install, jalankan kembali script ini.
    echo.
    pause
) else (
    echo [OK] Tailscale terdeteksi.
    tailscale status
)

echo.
echo [2/4] Mendeteksi IP Tailscale PC Master ini...
for /f "tokens=*" %%i in ('tailscale ip -4 2^>nul') do set TAILSCALE_IP=%%i

if "%TAILSCALE_IP%"=="" (
    echo [PERINGATAN] Tailscale belum aktif atau belum login.
    echo Silakan jalankan Tailscale dan login terlebih dahulu.
    set TAILSCALE_IP=127.0.0.1
) else (
    echo [SUKSES] IP Tailscale PC Master Anda: %TAILSCALE_IP%
)

echo.
echo [3/4] Menjalankan Server POS & WhatsApp Evolution API (Docker)...
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [PERINGATAN] Docker belum terpasang atau belum berjalan!
    echo Pastikan Docker Desktop sudah dibuka di PC Anda.
) else (
    docker compose -f docker-compose.pc-master.yml up -d
    echo [OK] Kontainer Server & Evolution API berhasil dijalankan!
)

echo.
echo ======================================================================
echo   SETUP PC MASTER SELESAI!
echo ======================================================================
echo.
echo   1. Akses Lokal di PC Ini : http://localhost atau http://localhost:3000
echo   2. Akses via Tailscale   : http://%TAILSCALE_IP%
echo   3. Evolution API WA      : http://%TAILSCALE_IP%:8080
echo.
echo   Langkah untuk Raspberry Pi (Kasir):
echo   - Jalankan script 'setup-pi-client.sh' di Raspberry Pi
echo   - Masukkan IP PC Master ini: %TAILSCALE_IP%
echo.
echo   Langkah untuk AI Studio (Cloud):
echo   - Masukkan URL: http://%TAILSCALE_IP% atau gunakan Tailscale Funnel
echo.
pause
