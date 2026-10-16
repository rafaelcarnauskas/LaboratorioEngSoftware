# Regras do Serviço de Histórico e do Serviço de Tempo de Uso.
# Mesmas regras de frontend/src/5-historico/modelo (usage.js e useHistory.js).
# Toda função que depende do relógio recebe `agora` (epoch em ms).
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .modelo import LEMBRETES, PreferenciaTempo, Visualizacao

FUSO = ZoneInfo("America/Sao_Paulo")
MAX_SEGUNDOS = 86400
MAX_VISUALIZACOES = 100
OPCOES_LIMITE = (30, 45, 60, 90, 120)
DIAS = ("Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom")  # indexado por weekday()
MESES = ("janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro")


def _data(ms):
    return datetime.fromtimestamp(ms / 1000, FUSO)


def chave_dia(ms):
    return _data(ms).date().isoformat()


def rotulo_grupo(ms, agora):
    dia = _data(ms).date()
    hoje = _data(agora).date()
    if dia == hoje:
        return "Hoje"
    if dia == hoje - timedelta(days=1):
        return "Ontem"
    return f"{dia.day} de {MESES[dia.month - 1]} de {dia.year}"


def mesclar(visualizacoes, nova):
    """Uma entrada por find: revisitar soma os segundos e avança o instante."""
    existente = next((v for v in visualizacoes if v.find_id == nova.find_id), None)
    outras = [v for v in visualizacoes if v.find_id != nova.find_id]
    if existente is not None:
        nova = Visualizacao(
            find_id=nova.find_id,
            segundos=min(existente.segundos + nova.segundos, MAX_SEGUNDOS),
            assistido_em=max(existente.assistido_em, nova.assistido_em),
        )
    todas = sorted([nova, *outras], key=lambda v: v.assistido_em, reverse=True)
    return todas[:MAX_VISUALIZACOES]


def minutos_do_dia(visualizacoes, dia):
    segundos = sum(v.segundos for v in visualizacoes if chave_dia(v.assistido_em) == dia)
    return round(segundos / 60)


def uso_semanal(visualizacoes, agora):
    hoje = _data(agora).date()
    semana = []
    for i in range(7):
        dia = hoje - timedelta(days=6 - i)
        chave = dia.isoformat()
        semana.append({
            "day": DIAS[dia.weekday()],
            "dayKey": chave,
            "minutes": minutos_do_dia(visualizacoes, chave),
            "current": i == 6,
        })
    return semana


def estado_limite(minutos, limite):
    bruto = round(minutos / limite * 100) if limite > 0 else 0
    passou = minutos >= limite
    return {
        "rawPercentage": bruto,
        "clampedPercentage": min(max(bruto, 0), 100),
        "remainingMinutes": max(limite - minutos, 0),
        "isOverLimit": passou,
        "status": "Limite atingido" if passou else "Dentro do limite",
    }


def agrupar_historico(visualizacoes, agora):
    grupos = {}
    for v in sorted(visualizacoes, key=lambda v: v.assistido_em, reverse=True):
        grupos.setdefault(rotulo_grupo(v.assistido_em, agora), []).append(v)
    return [{"label": rotulo, "items": itens} for rotulo, itens in grupos.items()]


# --- operações usadas pela API ---

def registrar_visualizacao(repo, usuario, find_id, segundos, assistido_em):
    if not find_id:
        raise ValueError("findId vazio")
    if not 0 < segundos <= MAX_SEGUNDOS:
        raise ValueError("segundos fora do intervalo")
    atual = mesclar(repo.visualizacoes(usuario), Visualizacao(find_id, segundos, assistido_em))
    repo.salvar_visualizacoes(usuario, atual)
    return next(v for v in atual if v.find_id == find_id)


def historico(repo, usuario, agora):
    return agrupar_historico(repo.visualizacoes(usuario), agora)


def recentes(repo, usuario, limite=4):
    return sorted(repo.visualizacoes(usuario), key=lambda v: v.assistido_em, reverse=True)[:limite]


def limpar_historico(repo, usuario):
    repo.limpar(usuario)


def resumo_tempo(repo, usuario, agora):
    visualizacoes = repo.visualizacoes(usuario)
    limite = repo.preferencia(usuario).limite_diario
    semana = uso_semanal(visualizacoes, agora)
    hoje = semana[-1]["minutes"]
    return {
        "todayMinutes": hoje,
        "weekUsage": semana,
        "averageMinutes": round(sum(d["minutes"] for d in semana) / 7),
        "balancedDays": sum(1 for d in semana if d["minutes"] < limite),
        "dailyLimit": limite,
        **estado_limite(hoje, limite),
    }


def atualizar_preferencias(repo, usuario, limite_diario, lembretes):
    if limite_diario not in OPCOES_LIMITE:
        raise ValueError("limite fora das opções")
    if set(lembretes) != set(LEMBRETES):
        raise ValueError("lembretes inválidos")
    pref = PreferenciaTempo(limite_diario, dict(lembretes))
    repo.salvar_preferencia(usuario, pref)
    return pref
