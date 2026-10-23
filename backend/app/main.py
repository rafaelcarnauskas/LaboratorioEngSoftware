import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.busca_listas.api import router as busca_listas_router
from app.comunidades.api import router as comunidades_router
from app.historico.api import router as historico_router


app = FastAPI(title="Choosen API", version="0.1.0")

# Render: CORS_ORIGINS com a URL do Static Site do front, separadas por vírgula.
origens = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origens,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(comunidades_router, prefix="/api/v1")
app.include_router(historico_router)  # já tem o prefixo /api/v1
app.include_router(busca_listas_router)  # já tem o prefixo /api/v1


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
