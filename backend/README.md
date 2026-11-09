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
| `CHOOSEN_SHARED_DATABASE_URL` | a mesma URL do banco próprio | URL do banco compartilhado com os outros microserviços (tabela `usuario_publico`). `postgres://` e `postgresql://` são convertidos para `postgresql+psycopg://`. Sem ela, a tabela fica no mesmo banco de `CHOOSEN_DATABASE_URL`. |

No frontend, `VITE_API_URL` é só o host do Backend (padrão `http://localhost:8000`); o frontend acrescenta `/api/v1`. Isso difere do texto do Requisito 12.1 (que põe `/api/v1` no padrão) por decisão do projeto, para seguir a mesma convenção de `frontend/src/2-comunidades/servico.js`.

## Banco e migrations

O esquema da Parte 1 (tabelas `usuario`, `sessao` e `token_redefinicao`) é criado e alterado só pelo Alembic; o Backend não cria tabelas ao iniciar.

```powershell
alembic upgrade head
```

Com a configuração padrão, isso cria `backend/choosen.db` se ele não existir.

O banco compartilhado (tabela `usuario_publico`) tem um segundo ambiente do Alembic, em `alembic_compartilhado/` (seção `[compartilhado]` do `alembic.ini`):

```powershell
alembic -n compartilhado upgrade head
```

| Comando | Banco (variável) | Tabela de versão |
|---|---|---|
| `alembic upgrade head` | próprio (`CHOOSEN_DATABASE_URL`) | `alembic_version` |
| `alembic -n compartilhado upgrade head` | compartilhado (`CHOOSEN_SHARED_DATABASE_URL`) | `alembic_version_compartilhado` |

Sem `CHOOSEN_SHARED_DATABASE_URL`, os dois comandos usam o mesmo banco; as tabelas de versão separadas permitem isso. Exemplo com dois bancos PostgreSQL:

```powershell
$env:CHOOSEN_DATABASE_URL = "postgresql://usuario:senha@localhost/choosen_autenticacao"
$env:CHOOSEN_SHARED_DATABASE_URL = "postgresql://usuario:senha@localhost/choosen_compartilhado"
alembic upgrade head
alembic -n compartilhado upgrade head
```

Para ver o SQL sem conectar, acrescente `--sql` a qualquer um dos comandos.

Depois da primeira migration do banco compartilhado, copie para ele os usuários que já existem no banco próprio:

```powershell
python -m app.autenticacao.republicar
```

O comando publica a mensagem `usuario.perfil_publicado` para cada usuário e pode rodar quantas vezes for preciso (a réplica não volta para um estado mais antigo). Também conserta a réplica depois de um WARNING em `choosen.integracao`. Sai com código 1 se alguma entrega falhar.

### Deploy (Render)

O comando de start do Render fica no painel, fora do repositório. Ele precisa rodar as duas migrations e a carga da réplica antes de subir o servidor:

```bash
alembic upgrade head && alembic -n compartilhado upgrade head && python -m app.autenticacao.republicar && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Sem a migration compartilhada, a API funciona, mas cada escrita de usuário registra um WARNING e a réplica fica vazia.

## Modelo de dados da autenticação

O microserviço de autenticação tem dois bancos (SQLAlchemy; PostgreSQL em produção, SQLite local):

- **Banco próprio** (`app/autenticacao/modelo.py`, migration `alembic/versions/0001`), fonte da verdade:
  - `usuario`: PK `id`; `email`, `username`, `username_normalizado`, `hash_senha`, `nome`, `descricao`, `foto`, `is_community_admin`, `is_system_admin`, `criado_em`, `atualizado_em`. Únicos: `uq_usuario_email` (`email`) e `uq_usuario_username_normalizado`.
  - `sessao`: PK `id`; FK `usuario_id → usuario.id` (`ON DELETE CASCADE`, índice `ix_sessao_usuario_id`); `token_hash` único; `criada_em`, `expira_em`, `revogada_em`.
  - `token_redefinicao`: PK `id`; FK `usuario_id → usuario.id` (`ON DELETE CASCADE`, índice `ix_token_redefinicao_usuario_id`); `token_hash` único; `criado_em`, `expira_em`, `usado_em`, `invalidado_em`.
- **Banco compartilhado** (`app/autenticacao/modelo_compartilhado.py`, migration `alembic_compartilhado/versions/c0001`):
  - `usuario_publico`: réplica do perfil público. PK `id` (o mesmo valor de `usuario.id`); `nome`, `username`, `email`, `descricao`, `foto`, `is_community_admin`, `is_system_admin`, `criado_em`, `atualizado_em`. Sem senha, sessões ou tokens, e sem constraints únicas além da PK.

`usuario.id = usuario_publico.id` é uma relação lógica 1 para 0..1, sem FK, porque as tabelas ficam em bancos diferentes. Depois de cada `commit` que cria ou altera um usuário (cadastro, edição de perfil, troca ou redefinição de senha, semeadura), `app/autenticacao/mensagens.py` publica a mensagem JSON `usuario.perfil_publicado`; o assinante grava a réplica pela `InterfaceDadosCompartilhados` (`app/autenticacao/dados_compartilhados.py`), que recebe e devolve só JSON. Uma mensagem com `updatedAt` mais antigo que o da réplica é ignorada. O barramento e a interface rodam hoje no mesmo processo da API; o contrato só com JSON é o que permite trocá-los por um broker e uma chamada remota.

A entrega acontece depois que a conexão do banco próprio volta ao pool. Se o banco compartilhado falhar, a resposta da API é a mesma e o logger `choosen.integracao` registra um WARNING. A resposta só atrasa enquanto a conexão ao banco compartilhado espera: com `CHOOSEN_SHARED_DATABASE_URL` em PostgreSQL, no máximo 5 segundos (`connect_timeout`, acrescentado se a URL não o definir).

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
alembic -n compartilhado upgrade head
python -m app.autenticacao.semear
```

(Com `CHOOSEN_SHARED_DATABASE_URL` apontando para outro banco, esvazie também a tabela `usuario_publico` dele.)

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
- Para ler dados de usuário a partir de outro microserviço, usar o banco compartilhado pela dependência `obter_dados_compartilhados` (de `app.autenticacao.dados_compartilhados`), que devolve só a leitura (`buscar_usuario_publico`). Só a autenticação grava a réplica. `obter_usuario_atual` e `buscar_por_id` continuam valendo.
- Para decidir permissão (por exemplo, `isSystemAdmin`), usar `obter_usuario_atual`, que lê o banco próprio. A réplica pode estar atrasada.

```python
from fastapi import Depends
from app.autenticacao.api import obter_usuario_atual

app.include_router(meu_router, prefix="/api/v1", dependencies=[Depends(obter_usuario_atual)])
```

(O router do `historico` já declara `prefix="/api/v1"`; nesse caso, inclua sem `prefix`.)
