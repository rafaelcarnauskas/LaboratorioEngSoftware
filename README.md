# LaboratorioEngSoftware

Projeto de PCS3642 - Laboratório de Engenharia de Software I (2026)
Depois entra em http://localhost:5173/

## Rodando o app

```bash
cd frontend
npm install
npm run dev
```

A tela de reels abre pelos cards Sports/Cute da Home ou direto pela URL:
http://localhost:5173/?tela=reels&categoria=sports

## Rodando os testes Selenium

Com o app rodando (`npm run dev`), em outro terminal:

```bash
cd selenium
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python test_reels.py
```

Na primeira execução o Selenium baixa o driver do Chrome (precisa de internet).
Para rodar sem abrir a janela do navegador, defina `HEADLESS=1`.
