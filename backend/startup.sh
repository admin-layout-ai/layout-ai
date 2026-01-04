#!/bin/bash
cd $APP_PATH
gunicorn --bind=0.0.0.0:8000 --workers=2 --worker-class=uvicorn.workers.UvicornWorker app.main:app
