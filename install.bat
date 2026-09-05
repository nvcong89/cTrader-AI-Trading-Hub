@echo off
echo ===================================================
echo AI Gemini Server - Installation Script
echo ===================================================

echo Creating Python Virtual Environment (venv)...
python -m venv venv

echo Activating Virtual Environment and Installing Dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt

echo Installing Frontend Dependencies...
cd frontend
npm install
cd ..

echo ===================================================
echo Installation Complete! 
echo You can now run the server using run.bat
echo ===================================================
pause
