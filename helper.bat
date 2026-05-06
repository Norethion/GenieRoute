@echo off
setlocal enabledelayedexpansion

REM Bat dosyasinin calistirildigi dizine gec
cd /d "%~dp0"

:MENU
cls
echo ==============================================================
echo          GENIEROUTE AI - Docker ve Proje Yonetimi
echo ==============================================================
echo.
echo   [1] Tumunu Baslat           (DB + Backend + Frontend)
echo   [2] Sadece DB Baslat        (PostgreSQL Docker)
echo   [3] Sadece Backend Baslat   (Express API - port 3001)
echo   [4] Sadece Frontend Baslat  (React Vite - port 5173)
echo   [5] Yeniden Baslat          (Docker restart)
echo   [6] Loglari Goster          (canli log takibi)
echo   [7] Durum Goster            (container durumlari)
echo   [8] Durdur                  (tumunu durdur)
echo   [9] Veritabanini Sifirla    (DIKKAT: Tum veri silinir!)
echo.
echo   [i] Ilk Kurulum             (npm install + docker build)
echo   [0] Cikis
echo.
echo ==============================================================
echo.
set /p choice="Seciminiz: "

if "%choice%"=="1" goto START_ALL
if "%choice%"=="2" goto START_DB
if "%choice%"=="3" goto START_BACKEND
if "%choice%"=="4" goto START_FRONTEND
if "%choice%"=="5" goto RESTART
if "%choice%"=="6" goto SHOW_LOGS
if "%choice%"=="7" goto SHOW_STATUS
if "%choice%"=="8" goto STOP
if "%choice%"=="9" goto RESET_DB
if /i "%choice%"=="i" goto FIRST_SETUP
if "%choice%"=="0" goto EXIT

echo.
echo [!] Gecersiz secim.
timeout /t 2 >nul
goto MENU

REM ==============================================================
REM   ILK KURULUM
REM ==============================================================
:FIRST_SETUP
cls
echo.
echo ==============================================================
echo              GENIEROUTE AI - ILK KURULUM
echo ==============================================================
echo.

echo [1/4] Docker kontrol ediliyor...
docker --version >nul 2>&1
if errorlevel 1 (
    echo [X] HATA: Docker bulunamadi! Lutfen Docker Desktop kurun.
    pause
    goto MENU
)
echo [OK] Docker mevcut.
echo.

echo [2/4] PostgreSQL container baslatiliyor...
docker-compose up -d postgres
if errorlevel 1 (
    echo [X] HATA: Docker compose basarisiz oldu.
    echo     Docker Desktop calisiyor mu kontrol edin.
    pause
    goto MENU
)
echo [OK] PostgreSQL baslatildi.
echo.

echo [3/4] Backend bagimliliklari yukleniyor...
cd backend
call npm install
if errorlevel 1 (
    echo [X] HATA: Backend npm install basarisiz oldu.
    cd ..
    pause
    goto MENU
)
cd ..
echo [OK] Backend bagimliliklari yuklendi.
echo.

echo [4/4] Frontend bagimliliklari yukleniyor...
cd frontend
call npm install
if errorlevel 1 (
    echo [X] HATA: Frontend npm install basarisiz oldu.
    cd ..
    pause
    goto MENU
)
cd ..
echo [OK] Frontend bagimliliklari yuklendi.
echo.

echo ==============================================================
echo   [OK] Ilk kurulum tamamlandi!
echo.
echo   Sonraki adimlar:
echo   1. backend\.env dosyasina API key'leri girin:
echo      - GOOGLE_PLACES_API_KEY
echo      - OPENAI_API_KEY
echo   2. frontend\.env dosyasina Google Maps key girin:
echo      - VITE_GOOGLE_MAPS_KEY
echo   3. Menuden [1] ile tumunu baslatin
echo ==============================================================
echo.
pause
goto MENU

REM ==============================================================
REM   TUMUNU BASLAT
REM ==============================================================
:START_ALL
echo.
echo [*] PostgreSQL baslatiliyor...
docker-compose up -d postgres
if errorlevel 1 (
    echo [X] HATA: PostgreSQL baslatilamadi. Docker Desktop acik mi?
    pause
    goto MENU
)
echo [OK] PostgreSQL calisiyor.
echo.

echo [*] Veritabani hazir olana kadar bekleniyor...
timeout /t 3 >nul

echo [*] Backend baslatiliyor (port 3001)...
start "GenieRoute Backend" cmd /k "cd /d %~dp0backend && npm run dev"
echo [OK] Backend baslatildi.
echo.

echo [*] Frontend baslatiliyor (port 5173)...
start "GenieRoute Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo [OK] Frontend baslatildi.
echo.

echo ==============================================================
echo   [OK] Tum servisler baslatildi!
echo.
echo   Frontend:   http://localhost:5173
echo   Backend:    http://localhost:3001
echo   API Health: http://localhost:3001/api/health
echo   PostgreSQL: localhost:5432
echo ==============================================================
echo.
pause
goto MENU

REM ==============================================================
REM   SADECE DB
REM ==============================================================
:START_DB
echo.
echo [*] PostgreSQL baslatiliyor...
docker-compose up -d postgres
if errorlevel 1 (
    echo [X] HATA: PostgreSQL baslatilamadi.
    pause
    goto MENU
)
echo [OK] PostgreSQL calisiyor (port 5432).
pause
goto MENU

REM ==============================================================
REM   SADECE BACKEND
REM ==============================================================
:START_BACKEND
echo.
echo [*] Backend baslatiliyor (port 3001)...
start "GenieRoute Backend" cmd /k "cd /d %~dp0backend && npm run dev"
echo [OK] Backend baslatildi: http://localhost:3001
pause
goto MENU

REM ==============================================================
REM   SADECE FRONTEND
REM ==============================================================
:START_FRONTEND
echo.
echo [*] Frontend baslatiliyor (port 5173)...
start "GenieRoute Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo [OK] Frontend baslatildi: http://localhost:5173
pause
goto MENU

REM ==============================================================
REM   YENIDEN BASLAT
REM ==============================================================
:RESTART
echo.
echo [*] Docker containerlar yeniden baslatiliyor...
docker-compose restart
if errorlevel 1 (
    echo [X] HATA: Yeniden baslatma basarisiz oldu.
    pause
    goto MENU
)
echo [OK] Containerlar yeniden baslatildi.
pause
goto MENU

REM ==============================================================
REM   LOGLAR
REM ==============================================================
:SHOW_LOGS
echo.
echo [*] Loglar gosteriliyor (Cikmak icin Ctrl+C)...
echo.
docker-compose logs -f --tail=100
pause
goto MENU

REM ==============================================================
REM   DURUM
REM ==============================================================
:SHOW_STATUS
echo.
echo ==============================================================
echo                     CONTAINER DURUMLARI
echo ==============================================================
echo.
docker-compose ps
echo.
echo ==============================================================
echo                     PORT KONTROL
echo ==============================================================
echo.
echo PostgreSQL (5432):
netstat -an | findstr ":5432" | findstr "LISTENING"
if errorlevel 1 echo   [X] Calismiyor
echo.
echo Backend (3001):
netstat -an | findstr ":3001" | findstr "LISTENING"
if errorlevel 1 echo   [X] Calismiyor
echo.
echo Frontend (5173):
netstat -an | findstr ":5173" | findstr "LISTENING"
if errorlevel 1 echo   [X] Calismiyor
echo.
pause
goto MENU

REM ==============================================================
REM   DURDUR
REM ==============================================================
:STOP
echo.
echo [*] Docker containerlar durduruluyor...
docker-compose stop
if errorlevel 1 (
    echo [X] HATA: Durdurma basarisiz oldu.
    pause
    goto MENU
)
echo [OK] Containerlar durduruldu.
echo.
echo [*] Backend/Frontend pencereleri aciksa manuel kapatin (Ctrl+C).
pause
goto MENU

REM ==============================================================
REM   VERITABANI SIFIRLA
REM ==============================================================
:RESET_DB
cls
echo.
echo ==============================================================
echo   DIKKAT: Bu islem TUM VERITABANI VERILERINI SILECEK!
echo.
echo   - Tum seyahat planlari
echo   - Tum kayitli mekan verileri
echo.
echo   BU ISLEM GERI ALINAMAZ!
echo ==============================================================
echo.

set /p confirm1="[1/2] Veritabanini silmek istediginizden emin misiniz? (evet/hayir): "
if /i not "%confirm1%"=="evet" (
    echo.
    echo [*] Islem iptal edildi.
    timeout /t 2 >nul
    goto MENU
)

echo.
echo [2/2] Son onay: "SIL" yazin:
set /p confirm2=""
if not "%confirm2%"=="SIL" (
    echo.
    echo [*] Yanlis giris. Islem iptal edildi.
    timeout /t 2 >nul
    goto MENU
)

echo.
echo [*] PostgreSQL container ve volume siliniyor...
docker-compose down -v
if errorlevel 1 (
    echo [X] HATA: Silme islemi basarisiz oldu.
    pause
    goto MENU
)

echo.
echo ==============================================================
echo   [OK] Veritabani silindi.
echo.
echo   Yeniden baslatmak icin menuden [1] (Tumunu Baslat) veya
echo   [2] (Sadece DB) secimini kullanabilirsin. Backend ilk
echo   acilista migration'lari otomatik uygulayacak.
echo ==============================================================
echo.
pause
goto MENU

REM ==============================================================
REM   CIKIS
REM ==============================================================
:EXIT
echo.
echo Gule gule!
timeout /t 1 >nul
exit /b 0
