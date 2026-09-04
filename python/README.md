# Ultron Local Python Microservice

This microservice provides a local loopback FastAPI engine for auxiliary inference, context management, and offline local page extraction for the Windows Desktop application.

---

## 🚀 Setup & Execution

### 1. Create Virtual Environment
```bash
python -m venv .venv
# On Windows PowerShell:
.venv\Scripts\Activate.ps1
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Start the Local Server
```bash
python server.py
```
*The server will bind strictly to loopback `127.0.0.1:8000` for privacy and offline containment.*

---

## 📡 API Endpoints

- **`GET /status`**: Health check and current active local model status.
- **`POST /query`**: Dispatches prompt query to the local inference engine (`phi4` or other Ollama models).
- **`POST /scrape`**: Securely extracts text from loopback/local URIs (`http://127.0.0.1`, `http://localhost`, `file://`).
