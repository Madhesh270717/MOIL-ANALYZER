# MOIL Smart Mining Hub - Backend API

Flask REST API providing manganese prospectivity predictions, operational planning simulations, satellite data integration, and decision-support analytics for MOIL.

## Setup

### 1. Prerequisites & Environment
Ensure Python 3.10+ is installed. Install backend dependencies:
```bash
pip install -r requirements.txt
# Or install core packages:
pip install flask flask-cors pandas numpy scikit-learn joblib rasterio earthengine-api geemap pytest
```

### 2. Google Earth Engine (GEE) Credentials
To authenticate with Google Earth Engine for live satellite imagery and CHIRPS rainfall:

Set the path to your Google Cloud service account JSON key using either:

**Option A (Recommended: File Path):**
- **Linux/macOS:**
  ```bash
  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your-service-account-key.json"
  ```
- **Windows (PowerShell):**
  ```powershell
  $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\your-service-account-key.json"
  ```
- **Windows (Command Prompt):**
  ```cmd
  set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\your-service-account-key.json
  ```

**Option B (Raw JSON String or File Path via GEE_SERVICE_ACCOUNT_JSON):**
- **PowerShell:**
  ```powershell
  $env:GEE_SERVICE_ACCOUNT_JSON = '{"type": "service_account", "project_id": "...", ...}'
  ```

**Option C (Interactive / Local Fallback):**
If no service account environment variable is defined, the backend falls back to standard user-authenticated Earth Engine sessions (`earthengine authenticate` / `ee.Initialize()`). If Earth Engine is not available, the backend continues running safely, serving cached prediction grids and datasets while reporting EE status via `/api/refresh-reserve-data` and `/api/system-status`.

### 3. AI Mine Assistant (Anthropic Messages API)
To enable live dynamic LLM responses for the AI Mine Assistant chat widget (supporting English, Hindi, and Tamil):

- **Linux/macOS:**
  ```bash
  export ANTHROPIC_API_KEY="sk-ant-..."
  ```
- **Windows (PowerShell):**
  ```powershell
  $env:ANTHROPIC_API_KEY = "sk-ant-..."
  ```
- **Windows (Command Prompt):**
  ```cmd
  set ANTHROPIC_API_KEY=sk-ant-...
  ```

*Note: If `ANTHROPIC_API_KEY` is not provided, the assistant automatically falls back to its built-in MOIL Grounded Mining Intelligence engine, answering questions in English, Hindi, and Tamil based on live dashboard state without errors.*

### 4. Running the Server
```bash
python backend/app.py
```
The API serves at `http://127.0.0.1:5000`.

### 4. Running Tests
```bash
python -m pytest backend/tests/test_api.py -v
```
