# LaboratorioEngSoftware

Projeto de PCS3642 - Laboratório de Engenharia de Software I (2026).

## Estrutura

```
frontend/          Aplicação React + Vite
  src/
    App.jsx        Shell da aplicação (Home, Profile, My Time, History)
    pages/         Telas: Reels, ListsView, SearchView (cada uma com seu CSS)
    hooks/         Hooks reutilizáveis (useLists)
    data/          Dados de demonstração (reels, videoCatalog)
    assets/        Imagens e ícones
selenium/          Testes end-to-end em Python
  run_all.py       Executa as duas suítes
  test_app.py      Suíte de Victor
  test_reels.py    Suíte de Murilo
  evidencias/      Capturas anteriores, preservadas
```

## Aplicação integrada

A versão integrada reúne Home, Profile, My Time, History, Lists e Search da
branch `victor`, os Reels de `murilo/reels` e os testes Selenium dos dois autores.
Os dados são de demonstração; as listas são salvas no navegador.

O `package.json` existe apenas dentro de `frontend/`. Rode os comandos npm a
partir dessa pasta, não da raiz do repositório.

```powershell
cd frontend
npm ci
npm run dev
```

Abra http://localhost:5173/. O Vite usa porta fixa e informa um erro caso esteja
ocupada. Os cards Sports e Cute abrem os Reels. As demais categorias abrem Search.
Também é possível abrir http://localhost:5173/?tela=reels&categoria=sports.
O botão Home dos Reels retorna à aplicação principal.

## Testes Selenium de Victor e Murilo

Pré-requisitos: Node.js, Python 3.10 ou superior e Google Chrome. Mantenha o app
rodando em um terminal. Em outro terminal, na raiz do repositório:

```powershell
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r selenium/requirements.txt
./.venv/Scripts/python.exe selenium/run_all.py
```

Use `py` no primeiro comando se esse for o comando Python disponível. Se nenhum
for reconhecido, instale Python com a opção de adicioná-lo ao PATH, ou substitua
`python` pelo caminho completo de uma instalação válida. Não é necessário ativar
o ambiente virtual. A pasta `.venv` é local e não deve ser versionada nem copiada
entre máquinas. Na primeira execução, o Selenium Manager pode precisar de
internet para obter o driver compatível com o Chrome.

O runner executa as duas suítes, incluindo os testes de integração, e retorna
código 1 se algum teste falhar. Cada teste usa uma sessão nova do navegador.

Para rodar sem abrir janelas, ou apontar para outro endereço:

```powershell
$env:HEADLESS = '1'
$env:URL_APP = 'http://localhost:5173'
./.venv/Scripts/python.exe selenium/run_all.py
```

Para executar separadamente:

```powershell
./.venv/Scripts/python.exe selenium/test_app.py
./.venv/Scripts/python.exe selenium/test_reels.py
```

- Victor: Home, Profile, My Time, History e criação/validação de Lists.
- Murilo: comentários válidos/inválidos e navegação por teclado nos Reels.
- Integração (em `test_app.py`): Home → Reels → Home → Lists → Search e salvar
  um resultado de Search em uma nova lista.

As novas capturas ficam em `selenium/test-results/victor/` (ignorado pelo Git).
As capturas anteriores em `selenium/evidencias/` foram preservadas.

## Verificações do frontend

```powershell
cd frontend
npm run lint
npm run build
```
