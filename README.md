# LaboratorioEngSoftware

Projeto de PCS3642 - Laboratório de Engenharia de Software I (2026).

## Estrutura

```
frontend/                  Aplicação React + Vite
  src/
    app/                   Shell (App.jsx, App.css) e contrato de URL (navigation.js)
    1-autenticacao/        Login, cadastro, perfil e plano
    2-comunidades/         Home, comunidades e gestão de comunidades
    3-videos/              Finds (feed de vídeos)
    4-busca-listas/        Busca e listas
    5-historico/           Histórico, Meu tempo, notificações e alertas
    tests/                 Testes de integração entre contextos
    assets/                Imagens e ícones
selenium/                  Testes end-to-end em Python
  run_all.py               Executa as suítes
  evidencias/              Capturas anteriores, preservadas
```

Cada contexto segue o mesmo formato: `telas/` (View), `orquestrador.js`
(Controller) e `modelo/` (Model).

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
ocupada.

Na primeira vez o app pede login. Enquanto não há backend, use o usuário de teste
**victor@email.com** / **choosen123** (definido em `frontend/src/1-autenticacao/modelo/session.js`).
O login fica salvo no navegador; o botão Sair, no Perfil, encerra a sessão e volta ao login.

Também é possível criar uma conta pelo link **Create account** da tela de login
(nome, e-mail, senha com no mínimo 8 caracteres e confirmação). Sem backend, as
contas ficam salvas só no navegador em que foram criadas.

Os cards Sports e Cute abrem os Reels. As demais categorias abrem Search.
Também é possível abrir http://localhost:5173/?tela=reels&categoria=sports.
O botão Home dos Reels retorna à aplicação principal.

## Backend

API FastAPI em `backend/`, organizada nos mesmos cinco contextos do front.

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
python -m pytest
```

Documentação interativa em http://localhost:8000/docs. Sem `DATABASE_URL` o banco é
um SQLite local (`choosen.db`). Enquanto a parte 1 (autenticação) não existe no
back, as rotas por usuário (Histórico, Listas) identificam o usuário pelo
cabeçalho provisório `X-Usuario`.

Parte 4 (Busca e listas), prefixo `/api/v1`:

- `GET /busca?termo=&categoria=&duracao=any|short|long&ordem=featured|title|shortest`
- `GET /listas`, `POST /listas`, `GET|PATCH|DELETE /listas/{id}`
- `POST /listas/{id}/itens` (409 se o vídeo já estiver na lista), `DELETE /listas/{id}/itens/{videoId}`
- `PUT /videos/{videoId}/listas` (modal "Salvar em uma lista": define em quais listas o vídeo fica)

## Testes Selenium

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

O runner executa as três suítes (login, telas principais e Reels), incluindo os
testes de integração, e retorna código 1 se algum teste falhar. Cada teste usa uma
sessão nova do navegador. As suítes de telas principais e Reels já começam logadas;
o login é testado à parte.

Para rodar sem abrir janelas, ou apontar para outro endereço:

```powershell
$env:HEADLESS = '1'
$env:URL_APP = 'http://localhost:5173'
./.venv/Scripts/python.exe selenium/run_all.py
```

Para executar separadamente:

```powershell
./.venv/Scripts/python.exe selenium/test_login.py
./.venv/Scripts/python.exe selenium/test_cadastro.py
./.venv/Scripts/python.exe selenium/test_app.py
./.venv/Scripts/python.exe selenium/test_finds.py
```

- Murilo (login): login válido e lembrado, campos vazios, e-mail inválido, senha
  incorreta e Sair.
- Murilo (cadastro): conta válida com novo login, campos vazios, e-mail já
  cadastrado, senha curta, senhas diferentes e retorno ao login.
- Victor: Home, Profile, My Time, History e criação/validação de Lists.
- Murilo (Reels): comentários válidos/inválidos e navegação por teclado.
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
