from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_lista_comunidades_mockadas() -> None:
    response = client.get("/api/v1/comunidades")

    assert response.status_code == 200
    assert {comunidade["id"] for comunidade in response.json()} == {
        "poli-usp",
        "judo-brasil",
        "vida-de-pet",
    }


def test_detalhe_retorna_nichos() -> None:
    response = client.get("/api/v1/comunidades/poli-usp")

    assert response.status_code == 200
    assert response.json()["nichos"] == [
        {"id": "basquete", "nome": "Basquete"},
        {"id": "atletismo", "nome": "Atletismo"},
        {"id": "vida-academica", "nome": "Vida acadêmica"},
    ]


def test_participacao_e_idempotente() -> None:
    primeira = client.post(
        "/api/v1/comunidades/poli-usp/participar",
        json={"usuario_id": "usuario-demo"},
    )
    segunda = client.post(
        "/api/v1/comunidades/poli-usp/participar",
        json={"usuario_id": "usuario-demo"},
    )

    assert primeira.status_code == 200
    assert primeira.json()["participou_agora"] is True
    assert segunda.status_code == 200
    assert segunda.json()["participou_agora"] is False

    detalhe = client.get("/api/v1/comunidades/poli-usp")
    assert detalhe.json()["quantidade_membros"] == 1285


def test_participacao_retorna_404_para_comunidade_inexistente() -> None:
    response = client.post(
        "/api/v1/comunidades/inexistente/participar",
        json={"usuario_id": "usuario-demo"},
    )

    assert response.status_code == 404
