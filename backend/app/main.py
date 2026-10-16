from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.comunidades.api import router as comunidades_router


app = FastAPI(title="Choosen API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(comunidades_router, prefix="/api/v1")


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
