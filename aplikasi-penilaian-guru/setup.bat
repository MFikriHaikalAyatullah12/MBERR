@echo off
echo ================================================
echo   APLIKASI PENILAIAN GURU SD - SETUP AWAL
echo ================================================
echo.

echo [1/3] Memeriksa Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js tidak ditemukan!
    echo Silakan install Node.js dari https://nodejs.org/
    pause
    exit /b 1
)
echo ✓ Node.js terdeteksi

echo.
echo [2/3] Menginstall dependencies...
cd backend
call npm install
if errorlevel 1 (
    echo ERROR: Gagal menginstall dependencies!
    pause
    exit /b 1
)

echo.
echo [3/3] Setup selesai!
echo.
echo ================================================
echo   APLIKASI SIAP DIGUNAKAN!
echo ================================================
echo.
echo Untuk menjalankan aplikasi:
echo 1. Jalankan: start.bat
echo 2. Atau buka browser ke: http://localhost:3000
echo.
echo File yang penting:
echo - Database: database/school.db (dibuat otomatis)
echo - Backup database secara berkala untuk keamanan data
echo.
pause
