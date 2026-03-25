@echo off
echo Starting Haoguan Electrons Website (PocketBase + BFF)...

echo Starting PocketBase...
start "PocketBase" cmd /k "cd backend && bin\pocketbase.exe serve --http=127.0.0.1:8090 --dir=pb_data --migrationsDir=pb_migrations"

echo Starting Backend Pipeline (BFF)...
start "Backend Pipeline" cmd /k "cd backend && timeout /t 2 >nul && npm start"

echo Starting Frontend Server...
start "Frontend Server" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================================
echo   Services are starting (PocketBase/BFF/Frontend)
echo.
echo   Once started, you can visit:
echo   http://localhost:5173
echo   Admin Mobile:
echo   http://localhost:3001/admin/mobile
echo ========================================================
echo.
pause
