FROM python:3.12-slim
WORKDIR /app
COPY api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY api/app /app/api/app
COPY artifacts/models.joblib /app/artifacts/models.joblib
COPY artifacts/bdg2_meter_models.joblib /app/artifacts/bdg2_meter_models.joblib
EXPOSE 8000
CMD ["uvicorn", "api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
