call %USERPROFILE%\miniconda3\Scripts\activate.bat base
cd /d "d:\Strategy Management Platform\smp000"
set PYTHONIOENCODING=utf-8
python -m uvicorn app.main:app --port 8001