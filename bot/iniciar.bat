@echo off
REM Preço Ninja - bot do WhatsApp. Se o bot parar (queda de internet, erro), volta sozinho em 30 s.
REM Para parar de vez: feche esta janela.
cd /d "%~dp0"
:inicio
call npm start
echo.
echo O bot parou. Reiniciando em 30 segundos... (feche a janela para parar)
timeout /t 30 /nobreak >nul
goto inicio
