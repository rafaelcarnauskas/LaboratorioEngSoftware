from app.comunidades.modelo import Comunidade, Nicho, Usuario


class ComunidadeNaoEncontradaError(LookupError):
    """Indica que a comunidade solicitada não existe no catálogo."""


class UsuarioNaoEncontradoError(LookupError):
    """Indica que o usuário solicitado não existe nos dados mockados."""


class ServicoComunidades:
    def __init__(self) -> None:
        self._comunidades = _criar_comunidades_mock()
        self._usuarios = _criar_usuarios_mock()

    def listar_comunidades(self) -> list[Comunidade]:
        return list(self._comunidades.values())

    def buscar_comunidade(self, comunidade_id: str) -> Comunidade:
        comunidade = self._comunidades.get(comunidade_id)
        if comunidade is None:
            raise ComunidadeNaoEncontradaError(comunidade_id)
        return comunidade

    def registrar_usuario(self, usuario_id: str, nome: str, email: str) -> None:
        """Registra no repositório em memória o perfil autenticado atual."""
        if usuario_id not in self._usuarios:
            self._usuarios[usuario_id] = Usuario(id=usuario_id, nome=nome, email=email)

    def participar(self, comunidade_id: str, usuario_id: str) -> bool:
        comunidade = self.buscar_comunidade(comunidade_id)
        usuario = self._usuarios.get(usuario_id)
        if usuario is None:
            raise UsuarioNaoEncontradoError(usuario_id)

        if comunidade_id in usuario.comunidades:
            return False

        usuario.comunidades.add(comunidade_id)
        comunidade.quantidade_membros += 1
        return True

    def usuario_participa(self, comunidade_id: str, usuario_id: str) -> bool:
        if usuario_id not in self._usuarios:
            raise UsuarioNaoEncontradoError(usuario_id)
        self.buscar_comunidade(comunidade_id)
        return comunidade_id in self._usuarios[usuario_id].comunidades


def _criar_comunidades_mock() -> dict[str, Comunidade]:
    return {
        "poli-usp": Comunidade(
            id="poli-usp",
            nome="Poli USP",
            descricao="Esportes e vida acadêmica da Escola Politécnica da USP.",
            quantidade_membros=1284,
            nichos=(
                Nicho(id="basquete", nome="Basquete"),
                Nicho(id="atletismo", nome="Atletismo"),
                Nicho(id="vida-academica", nome="Vida acadêmica"),
            ),
        ),
        "judo-brasil": Comunidade(
            id="judo-brasil",
            nome="Judô Brasil",
            descricao="Treinos, campeonatos e técnica para judocas.",
            quantidade_membros=642,
            nichos=(
                Nicho(id="treino", nome="Treino"),
                Nicho(id="competicao", nome="Competição"),
                Nicho(id="tecnica", nome="Técnica"),
            ),
        ),
        "vida-de-pet": Comunidade(
            id="vida-de-pet",
            nome="Vida de Pet",
            descricao="O dia a dia de quem divide a casa com um bichinho.",
            quantidade_membros=3907,
            nichos=(
                Nicho(id="rotina", nome="Rotina"),
                Nicho(id="festas", nome="Festas"),
                Nicho(id="cuidados", nome="Cuidados"),
            ),
        ),
    }


def _criar_usuarios_mock() -> dict[str, Usuario]:
    return {
        "usuario-demo": Usuario(
            id="usuario-demo",
            nome="Victor Mendes",
            email="victor@email.com",
        ),
    }
