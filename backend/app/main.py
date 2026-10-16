import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.historico.api import router as historico

app = FastAPI(title="Choosen API")

# Render: CORS_ORIGINS com a URL do Static Site do front, separadas por vírgula.
origens = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origens, allow_methods=["*"], allow_headers=["*"])

app.include_router(historico)


@app.get("/health")
def health():
    return {"status": "ok"}
