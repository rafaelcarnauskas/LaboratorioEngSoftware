from dataclasses import dataclass, field


@dataclass(frozen=True)
class Nicho:
    id: str
    nome: str


@dataclass
class Usuario:
    id: str
    nome: str
    email: str
    comunidades: set[str] = field(default_factory=set)


@dataclass
class Comunidade:
    id: str
    nome: str
    descricao: str
    quantidade_membros: int
    nichos: tuple[Nicho, ...]