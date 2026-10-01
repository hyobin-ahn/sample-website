@echo off
chcp 65001 > nul
title SDU 웹사이트 외부 접속기

echo ========================================================
echo   [1/2] 로컬 서버(server.py)를 백그라운드에서 실행합니다...
echo ========================================================
start /B "" "C:\Users\bin13\AppData\Local\Programs\Python\Python314\python.exe" server.py > nul 2>&1

echo.
echo ========================================================
echo   [2/2] Cloudflare 초고속 안전 터널을 연결합니다...
echo   아래에 표시되는 https://xxxx.trycloudflare.com 링크를
echo   스마트폰이나 외부 브라우저로 여시면 됩니다!
echo ========================================================
echo.

.\cloudflared.exe tunnel --edge-ip-version 4 --url http://127.0.0.1:8080

pause
