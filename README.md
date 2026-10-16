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
ocupada.

Na primeira vez o app pede login. Enquanto não há backend, use o usuário de teste
**victor@email.com** / **choosen123** (definido em `frontend/src/hooks/session.js`).
O login fica salvo no navegador; o botão Sair, no Perfil, encerra a sessão e volta ao login.

Também é possível criar uma conta pelo link **Create account** da tela de login
(nome, e-mail, senha com no mínimo 8 caracteres e confirmação). Sem backend, as
contas ficam salvas só no navegador em que foram criadas.

Os cards Sports e Cute abrem os Reels. As demais categorias abrem Search.
Também é possível abrir http://localhost:5173/?tela=reels&categoria=sports.
O botão Home dos Reels retorna à aplicação principal.

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
./.venv/Scripts/python.exe selenium/test_reels.py
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
