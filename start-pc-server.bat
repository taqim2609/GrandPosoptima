@echo off
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
