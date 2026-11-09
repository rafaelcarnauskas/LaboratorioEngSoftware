# Banco compartilhado visto pelo Histórico: usuário (dono: autenticação) e vídeo (dono: vídeos).
# O Histórico só lê, e sempre pela API remota: nunca abre este banco direto.
from functools import lru_cache
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.db.base import criar_engine, criar_tabelas, database_url


class BaseCompartilhada(DeclarativeBase):
    pass


class UsuarioTabela(BaseCompartilhada):
    __tablename__ = "compartilhado_usuarios"
    usuario: Mapped[str] = mapped_column(String(255), primary_key=True)


class VideoTabela(BaseCompartilhada):
    __tablename__ = "compartilhado_videos"
    find_id: Mapped[str] = mapped_column(String(255), primary_key=True)


class RepositorioCompartilhado:
    def __init__(self, engine):
        criar_tabelas(engine, BaseCompartilhada)
        self._sessao = sessionmaker(engine)

    def usuario_existe(self, usuario):
        with self._sessao() as s:
            return s.get(UsuarioTabela, usuario) is not None

    def video_existe(self, find_id):
        with self._sessao() as s:
            return s.get(VideoTabela, find_id) is not None


@lru_cache
def get_repositorio_compartilhado():
    url = database_url("COMPARTILHADO_DATABASE_URL", "sqlite:///./choosen_compartilhado.db")
    return RepositorioCompartilhado(criar_engine(url))


router = APIRouter(prefix="/api/v1/compartilhado", tags=["compartilhado"])


@router.get("/usuarios/{usuario}")
def ler_usuario(usuario: str, repo=Depends(get_repositorio_compartilhado)):
    if not repo.usuario_existe(usuario):
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"usuario": usuario}


@router.get("/videos/{find_id}")
def ler_video(find_id: str, repo=Depends(get_repositorio_compartilhado)):
    if not repo.video_existe(find_id):
        raise HTTPException(status_code=404, detail="Vídeo não encontrado")
    return {"findId": find_id}


class ClienteRemoto:
    def __init__(self, http):
        self._http = http  # httpx.Client com base_url do serviço compartilhado

    def _existe(self, recurso, chave):
        r = self._http.get(f"/api/v1/compartilhado/{recurso}/{quote(chave, safe='')}")
        if r.status_code == 404:
            return False
        r.raise_for_status()
        return True

    def usuario_existe(self, usuario):
        return self._existe("usuarios", usuario)

    def video_existe(self, find_id):
        return self._existe("videos", find_id)
