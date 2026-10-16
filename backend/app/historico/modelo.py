from dataclasses import dataclass, field, replace

LEMBRETES = ("bedtime", "screenTime", "weekly")


@dataclass(frozen=True)
class Visualizacao:
    find_id: str
    segundos: int
    assistido_em: int  # epoch em ms, como no front


@dataclass(frozen=True)
class PreferenciaTempo:
    limite_diario: int = 60
    lembretes: dict = field(default_factory=lambda: {"bedtime": True, "screenTime": True, "weekly": False})


# Acesso a dados em memória até o Ciclo 3 (banco de dados).
class RepositorioHistorico:
    def __init__(self):
        self._visualizacoes = {}
        self._preferencias = {}

    def visualizacoes(self, usuario):
        return list(self._visualizacoes.get(usuario, []))

    def salvar_visualizacoes(self, usuario, visualizacoes):
        self._visualizacoes[usuario] = list(visualizacoes)

    def limpar(self, usuario):
        self._visualizacoes.pop(usuario, None)

    def preferencia(self, usuario):
        pref = self._preferencias.get(usuario, PreferenciaTempo())
        return replace(pref, lembretes=dict(pref.lembretes))

    def salvar_preferencia(self, usuario, preferencia):
        self._preferencias[usuario] = preferencia


repositorio = RepositorioHistorico()
