# Quickstart Pengembang

Panduan menjalankan sistem Grand Aceh Kuliner POS secara lokal [POS-FR-001].

## Menjalankan Backend (FastAPI)
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export MONGO_URL=mongodb://localhost:27017 DB_NAME=grandpos JWT_SECRET=devsecret
uvicorn server:app --reload --port 8000
```

## Menjalankan Frontend (React 19)
```bash
cd frontend
yarn install
REACT_APP_BACKEND_URL=http://localhost:8000 yarn start
```
