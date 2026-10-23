# Backend do Choosen

API em FastAPI + SQLAlchemy + Alembic. A Parte 1 (autenticação e conta) fica em `app/autenticacao/`; as rotas ficam sob `/api/v1`.

Os comandos abaixo são para PowerShell (Windows) e, salvo indicação, rodam dentro de `backend/`.

## Instalação

O ambiente virtual fica na raiz do repositório (`.venv`, Python 3.14):

```powershell
# na raiz do repositório
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

Todas as dependências em `requirements.txt` têm versão fixa (`==`). Duas não são usadas diretamente pela Parte 1:

- `psycopg[binary]`: driver do Postgres usado no Render (`DATABASE_URL` vira `postgresql+psycopg://`).
- `tzdata`: base de fusos horários para `ZoneInfo("America/Sao_Paulo")` no Windows, usada pelo `historico`.

## Configuração

Lida de variáveis de ambiente em `app/core/config.py`. Valor inválido interrompe a inicialização (e o Alembic e a semeadura) com uma mensagem que cita a variável e os valores aceitos.

| Variável | Padrão | Descrição |
|---|---|---|
| `CHOOSEN_ENV` | `development` | `development`, `test` ou `production`. |
| `CHOOSEN_DATABASE_URL` | `sqlite:///<backend>/choosen.db` | URL do SQLAlchemy. Se ausente, usa `DATABASE_URL` (nome do Render). `postgres://` e `postgresql://` são convertidos para `postgresql+psycopg://`. |
| `CHOOSEN_CORS_ORIGINS` | `http://localhost:5173` | Origens permitidas, separadas por vírgula (espaços nas pontas são ignorados). Se ausente, usa `CORS_ORIGINS`. |
| `CHOOSEN_SESSION_TTL_MINUTES` | `10080` (7 dias) | Validade da sessão em minutos, inteiro de 1 a 525600. |
| `CHOOSEN_FRONTEND_URL` | `http://localhost:5173` | Base do link de redefinição de senha. |

No frontend, `VITE_API_URL` é só o host do Backend (padrão `http://localhost:8000`); o frontend acrescenta `/api/v1`. Isso difere do texto do Requisito 12.1 (que põe `/api/v1` no padrão) por decisão do projeto, para seguir a mesma convenção de `frontend/src/2-comunidades/servico.js`.

## Banco e migrations

O esquema da Parte 1 (tabelas `usuario`, `sessao` e `token_redefinicao`) é criado e alterado só pelo Alembic; o Backend não cria tabelas ao iniciar.

```powershell
alembic upgrade head
```

Com a configuração padrão, isso cria `backend/choosen.db` se ele não existir.

O `alembic/env.py` só gerencia as tabelas da Parte 1. As tabelas do `historico` (`historico_visualizacoes` e `historico_preferencias`) são criadas pelo próprio módulo com `create_all` na primeira requisição a essas rotas. Esse módulo lê `DATABASE_URL` (e não `CHOOSEN_DATABASE_URL`) e, sem ela, usa `./choosen.db` relativo ao diretório atual, ou seja, o mesmo arquivo quando o servidor roda em `backend/`.

## Usuário de demonstração

```powershell
python -m app.autenticacao.semear
```

Só roda com `CHOOSEN_ENV=development` (o padrão); em outro ambiente recusa e sai com código 1. Cria ou restaura `victor@email.com` / `choosen123` (nome `Victor Mendes`, username `victor`, `isCommunityAdmin` e `isSystemAdmin` verdadeiros), sem duplicar o registro. Exige o esquema criado (`alembic upgrade head`).

## Rodar

```powershell
# backend/
uvicorn app.main:app --reload --port 8000

# frontend/ (outro terminal)
npm run dev
```

- API em `http://localhost:8000/api/v1`; documentação em `http://localhost:8000/docs`.
- `GET /api/v1/health` responde 200 sem autenticação. A rota antiga `GET /health` continua disponível.

### Redefinição de senha em desenvolvimento

Ainda não há envio de e-mail. Com `CHOOSEN_ENV=development`, quando o e-mail pedido pertence a uma conta, o servidor registra no log (logger `choosen.autenticacao`, nível INFO) o token e o link:

```
{CHOOSEN_FRONTEND_URL}?tela=redefinir-senha&token=<token>
```

Abra o link no navegador para chegar à tela de redefinição. Fora de development o token não aparece em nenhum log.

## Testes

```powershell
python -m pytest app/tests
```

O `app/tests/conftest.py` define `CHOOSEN_ENV=test` e descarta as outras variáveis `CHOOSEN_*`, `DATABASE_URL` e `CORS_ORIGINS` da máquina. Cada teste usa uma cópia temporária de um SQLite criado pelas migrations, nunca `backend/choosen.db`, e qualquer acesso à rede falha. A suíte leva cerca de 4 minutos.

## Restaurar o estado inicial do banco

Estado inicial = banco criado pelas migrations com só o usuário de demonstração. Necessário para que duas execuções seguidas dos Testes_Selenium tenham o mesmo resultado. Pare o Backend antes (no Windows o arquivo pode ficar bloqueado enquanto o servidor tem conexões abertas):

```powershell
Remove-Item choosen.db -ErrorAction SilentlyContinue
alembic upgrade head
python -m app.autenticacao.semear
```

Isso também apaga as contas criadas pelos testes, as sessões e os dados do `historico` gravados no mesmo arquivo.

## Testes_Selenium

Exigem o frontend em `http://localhost:5173`, o Backend em `http://localhost:8000` com `CHOOSEN_ENV=development` e o usuário de demonstração semeado (de preferência com o banco no estado inicial):

```powershell
# na raiz do repositório
python selenium/run_all.py
```

`URL_APP` e `URL_API` mudam os endereços (padrões `http://localhost:5173` e `http://localhost:8000/api/v1`); `HEADLESS=1` roda o Chrome sem janela. O `selenium/apoio_sessao.py` faz o login real pela API para os testes que começam logados.

| Teste | Ajuste | Motivo |
|---|---|---|
| `test_app.py` | O `setUp` usa `entrar_via_api(...)` em vez de gravar `{email, name}` no `localStorage`. | O frontend descarta sessão sem token e confirma o token em `GET /usuarios/me`. |
| `test_finds.py` | Mesmo ajuste de `test_app.py`. | Mesmo motivo. |
| `test_cadastro.py` | `test_cadastro_valido_entra_e_permite_novo_login` usa um e-mail novo a cada execução (`ana.<8 hex>@email.com`). | Com `ana@email.com` fixo, a segunda execução recebe "e-mail já cadastrado" e falha. |
| `test_login.py` | Só o comentário sobre a origem do usuário de teste, que agora vem da semeadura. | Os fluxos já usam o login real pela tela. |

Mensagem de conexão (Requisito 15.7), conferida à mão porque a suíte precisa do Backend no ar: com o frontend rodando e o Backend parado, envie o login ou o cadastro. Em até 10 segundos `login-erro` ou `cadastro-erro` mostra "Não foi possível conectar ao servidor. Tente novamente.", os campos mantêm os valores (exceto senhas) e `choosen.session` não é gravada.

Divergência já existente, não causada pela Parte 1: `test_app.py` procura textos em inglês (`Hi, Victor`, `Profile Settings`, aba `Profile`) que o frontend atual exibe em português (`Olá, Victor`, `Configurações do perfil`, `Perfil`). Falhas por esses textos não são regressão da autenticação.

## Integração com as partes 2 a 5

`app/main.py` também inclui os routers de `comunidades` e `historico`, que ainda não exigem sessão (o `historico` usa o cabeçalho provisório `X-Usuario`). Regra para as partes 2 a 5 (detalhes na docstring de `obter_usuario_atual` em `app/autenticacao/api.py`):

- Incluir cada router em `main.py` com `dependencies=[Depends(obter_usuario_atual)]`, para que todos os seus endpoints exijam sessão válida (sem ela: `401 sessao_invalida`).
- O endpoint que precisa do usuário recebe o perfil público (sem token nem hash de senha) declarando um parâmetro `usuario = Depends(obter_usuario_atual)`; o FastAPI reaproveita o resultado da dependência do router.
- De `app.autenticacao`, importar só `obter_usuario_atual` (de `app.autenticacao.api`) e `buscar_por_id` (de `app.autenticacao.servico`). Nunca ler `modelo.py` nem as tabelas `usuario` e `sessao` diretamente.

```python
from fastapi import Depends
from app.autenticacao.api import obter_usuario_atual

app.include_router(meu_router, prefix="/api/v1", dependencies=[Depends(obter_usuario_atual)])
```

(O router do `historico` já declara `prefix="/api/v1"`; nesse caso, inclua sem `prefix`.)
