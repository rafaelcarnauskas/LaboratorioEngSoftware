from datetime import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.historico import api, servico
from app.db.base import criar_engine
from app.historico.modelo import RepositorioMemoria, RepositorioSQL, Visualizacao


def ms(ano, mes, dia, hora=12, minuto=0):
    return int(datetime(ano, mes, dia, hora, minuto, tzinfo=servico.FUSO).timestamp() * 1000)


AGORA = ms(2026, 10, 16, 15, 0)  # sexta-feira
USUARIO = {"X-Usuario": "victor@email.com"}


@pytest.fixture(params=["memoria", "sqlite"])
def repo(request):
    if request.param == "memoria":
        return RepositorioMemoria()
    return RepositorioSQL(criar_engine("sqlite://"))


@pytest.fixture
def cliente(repo):
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[api.get_repositorio] = lambda: repo
    app.dependency_overrides[api.get_agora] = lambda: AGORA
    return TestClient(app)


# --- regras ---

def test_mesclar_acumula_segundos_e_avanca_instante():
    antes = [Visualizacao("a", 30, ms(2026, 10, 15))]
    depois = servico.mesclar(antes, Visualizacao("a", 20, ms(2026, 10, 16)))
    assert depois == [Visualizacao("a", 50, ms(2026, 10, 16))]


def test_mesclar_nao_retrocede_instante():
    antes = [Visualizacao("a", 30, ms(2026, 10, 16))]
    depois = servico.mesclar(antes, Visualizacao("a", 20, ms(2026, 10, 15)))
    assert depois[0].assistido_em == ms(2026, 10, 16)


def test_mesclar_respeita_teto_de_segundos():
    antes = [Visualizacao("a", servico.MAX_SEGUNDOS - 10, AGORA)]
    depois = servico.mesclar(antes, Visualizacao("a", 60, AGORA))
    assert depois[0].segundos == servico.MAX_SEGUNDOS


def test_mesclar_mantem_os_100_mais_recentes():
    antes = [Visualizacao(f"f{i}", 10, AGORA - i * 1000) for i in range(100)]
    depois = servico.mesclar(antes, Visualizacao("novo", 10, AGORA + 1000))
    assert len(depois) == 100
    assert depois[0].find_id == "novo"
    assert "f99" not in {v.find_id for v in depois}


def test_chave_dia_usa_fuso_de_sao_paulo():
    # 23:50 em São Paulo já é dia seguinte em UTC
    assert servico.chave_dia(ms(2026, 10, 15, 23, 50)) == "2026-10-15"


def test_rotulo_grupo():
    assert servico.rotulo_grupo(ms(2026, 10, 16, 8), AGORA) == "Hoje"
    assert servico.rotulo_grupo(ms(2026, 10, 15, 23), AGORA) == "Ontem"
    assert servico.rotulo_grupo(ms(2026, 10, 3), AGORA) == "3 de outubro de 2026"


def test_minutos_do_dia_arredonda():
    vs = [Visualizacao("a", 89, AGORA), Visualizacao("b", 1, ms(2026, 10, 15))]
    assert servico.minutos_do_dia(vs, "2026-10-16") == 1


def test_uso_semanal_tem_sete_dias_terminando_hoje():
    semana = servico.uso_semanal([Visualizacao("a", 600, AGORA)], AGORA)
    assert [d["dayKey"] for d in semana][0] == "2026-10-10"
    assert semana[-1] == {"day": "Sex", "dayKey": "2026-10-16", "minutes": 10, "current": True}
    assert sum(d["current"] for d in semana) == 1


def test_estado_limite():
    assert servico.estado_limite(30, 60) == {
        "rawPercentage": 50, "clampedPercentage": 50, "remainingMinutes": 30,
        "isOverLimit": False, "status": "Dentro do limite",
    }
    acima = servico.estado_limite(90, 60)
    assert acima["rawPercentage"] == 150 and acima["clampedPercentage"] == 100
    assert acima["isOverLimit"] and acima["remainingMinutes"] == 0
    assert servico.estado_limite(60, 60)["status"] == "Limite atingido"


def test_atualizar_preferencias_rejeita_valores_invalidos(repo):
    with pytest.raises(ValueError):
        servico.atualizar_preferencias(repo, "u", 50, {"bedtime": True, "screenTime": True, "weekly": True})
    with pytest.raises(ValueError):
        servico.atualizar_preferencias(repo, "u", 60, {"bedtime": True})


# --- API ---

def test_sem_usuario_retorna_401(cliente):
    assert cliente.get("/api/v1/historico").status_code == 401


def test_registrar_e_listar_agrupado(cliente):
    r = cliente.post("/api/v1/historico/visualizacoes", headers=USUARIO,
                     json={"findId": "f1", "seconds": 40, "watchedAt": ms(2026, 10, 15, 20)})
    assert r.status_code == 201
    cliente.post("/api/v1/historico/visualizacoes", headers=USUARIO, json={"findId": "f2", "seconds": 30})
    cliente.post("/api/v1/historico/visualizacoes", headers=USUARIO, json={"findId": "f2", "seconds": 15})

    grupos = cliente.get("/api/v1/historico", headers=USUARIO).json()
    assert [g["label"] for g in grupos] == ["Hoje", "Ontem"]
    assert grupos[0]["items"] == [{"findId": "f2", "seconds": 45, "watchedAt": AGORA}]
    assert grupos[1]["items"][0]["findId"] == "f1"


@pytest.mark.parametrize("corpo", [
    {"findId": "", "seconds": 10},
    {"findId": "f1", "seconds": 0},
    {"findId": "f1", "seconds": servico.MAX_SEGUNDOS + 1},
    {"findId": "f1", "seconds": 10, "watchedAt": -5},
    {"seconds": 10},
])
def test_registrar_rejeita_entrada_invalida(cliente, corpo):
    r = cliente.post("/api/v1/historico/visualizacoes", headers=USUARIO, json=corpo)
    assert r.status_code == 422


def test_recentes_respeita_limite_e_ordem(cliente):
    for i in range(6):
        cliente.post("/api/v1/historico/visualizacoes", headers=USUARIO,
                     json={"findId": f"f{i}", "seconds": 10, "watchedAt": AGORA - i * 60000})
    r = cliente.get("/api/v1/historico/recentes", headers=USUARIO).json()
    assert [v["findId"] for v in r] == ["f0", "f1", "f2", "f3"]
    r = cliente.get("/api/v1/historico/recentes?limite=2", headers=USUARIO).json()
    assert len(r) == 2


def test_limpar_historico(cliente):
    cliente.post("/api/v1/historico/visualizacoes", headers=USUARIO, json={"findId": "f1", "seconds": 10})
    assert cliente.delete("/api/v1/historico", headers=USUARIO).status_code == 204
    assert cliente.get("/api/v1/historico", headers=USUARIO).json() == []


def test_usuarios_isolados(cliente):
    cliente.post("/api/v1/historico/visualizacoes", headers=USUARIO, json={"findId": "f1", "seconds": 10})
    outro = {"X-Usuario": "outro@email.com"}
    assert cliente.get("/api/v1/historico", headers=outro).json() == []


def test_preferencias_padrao(cliente):
    r = cliente.get("/api/v1/tempo/preferencias", headers=USUARIO).json()
    assert r == {"dailyLimit": 60, "reminders": {"bedtime": True, "screenTime": True, "weekly": False}}


def test_salvar_preferencias(cliente):
    novo = {"dailyLimit": 90, "reminders": {"bedtime": False, "screenTime": True, "weekly": True}}
    assert cliente.put("/api/v1/tempo/preferencias", headers=USUARIO, json=novo).json() == novo
    assert cliente.get("/api/v1/tempo/preferencias", headers=USUARIO).json() == novo


@pytest.mark.parametrize("corpo", [
    {"dailyLimit": 50, "reminders": {"bedtime": True, "screenTime": True, "weekly": True}},
    {"dailyLimit": 60, "reminders": {"bedtime": True, "screenTime": True}},
    {"dailyLimit": 60, "reminders": {"bedtime": True, "screenTime": True, "weekly": True, "extra": True}},
])
def test_salvar_preferencias_rejeita_invalidas(cliente, corpo):
    assert cliente.put("/api/v1/tempo/preferencias", headers=USUARIO, json=corpo).status_code == 422


def test_resumo_de_tempo(cliente):
    cliente.put("/api/v1/tempo/preferencias", headers=USUARIO,
                json={"dailyLimit": 30, "reminders": {"bedtime": True, "screenTime": True, "weekly": False}})
    cliente.post("/api/v1/historico/visualizacoes", headers=USUARIO, json={"findId": "f1", "seconds": 45 * 60})
    cliente.post("/api/v1/historico/visualizacoes", headers=USUARIO,
                 json={"findId": "f2", "seconds": 10 * 60, "watchedAt": ms(2026, 10, 14)})

    r = cliente.get("/api/v1/tempo/resumo", headers=USUARIO).json()
    assert r["todayMinutes"] == 45
    assert r["dailyLimit"] == 30
    assert r["averageMinutes"] == 8  # (45 + 10) / 7
    assert r["balancedDays"] == 6
    assert r["isOverLimit"] and r["rawPercentage"] == 150 and r["clampedPercentage"] == 100
    assert len(r["weekUsage"]) == 7 and r["weekUsage"][-1]["current"]


def test_sqlite_persiste_entre_instancias(tmp_path):
    url = f"sqlite:///{tmp_path / 'choosen.db'}"
    servico.registrar_visualizacao(RepositorioSQL(criar_engine(url)), "u", "f1", 30, AGORA)
    servico.atualizar_preferencias(RepositorioSQL(criar_engine(url)), "u", 90,
                                   {"bedtime": False, "screenTime": True, "weekly": True})
    novo = RepositorioSQL(criar_engine(url))
    assert novo.visualizacoes("u") == [Visualizacao("f1", 30, AGORA)]
    assert novo.preferencia("u").limite_diario == 90
