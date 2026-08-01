@echo off
title Elder Care AI - All Services
echo ========================================
echo   智慧長照陪伴系統 - 一鍵啟動
echo ========================================
echo.

:: 啟動後端 (Flask API - port 5000)
echo [1/3] 啟動後端 API...
start "Backend API" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate && python app.py"

:: 等 2 秒讓後端先跑起來
timeout /t 2 /nobreak >nul

:: 啟動 STT 服務 (port 8001)
echo [2/3] 啟動 STT 語音辨識服務...
start "STT Service" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate && cd stt_service && python main.py"

:: 等 1 秒
timeout /t 1 /nobreak >nul

:: 啟動前端 (Vite dev server - port 5173)
echo [3/3] 啟動前端...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

:: 等 3 秒讓前端跑起來
timeout /t 3 /nobreak >nul

:: 自動開啟瀏覽器
echo.
echo ========================================
echo   全部啟動完成！正在開啟瀏覽器...
echo   前端: http://localhost:5173
echo   後端: http://localhost:5000
echo   STT:  ws://localhost:8001
echo ========================================
echo.
echo   關閉方式：關掉這個視窗不會停止服務
echo   要完全停止，請關閉另外三個命令視窗
echo ========================================

start http://localhost:5173
