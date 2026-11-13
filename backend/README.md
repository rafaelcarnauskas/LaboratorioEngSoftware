# Backend do Choosen

API em FastAPI + SQLAlchemy + Alembic, com os cinco microserviços (autenticação, comunidades, vídeos, busca e listas, histórico) e a infraestrutura de dados compartilhados; as rotas ficam sob `/api/v1`.

Os comandos abaixo são para PowerShell (Windows) e, salvo indicação, rodam dentro de `backend/`.

## Instalação

O ambiente virtual fica na raiz do repositório (`.venv`, Python 3.14):

```powershell
# na raiz do repositório
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

Todas as dependências em `requirements.txt` têm versão fixa (`==`). Duas merecem nota:

- `psycopg[binary]`: driver do PostgreSQL (`postgresql://` vira `postgresql+psycopg://`).
- `tzdata`: base de fusos horários para `ZoneInfo("America/Sao_Paulo")` no Windows, usada pelo `historico`.

## Configuração

Lida de variáveis de ambiente em `app/core/config.py`. Valor inválido interrompe a inicialização (e o Alembic e a semeadura) com uma mensagem que cita a variável e os valores aceitos.

| Variável | Padrão | Descrição |
|---|---|---|
| `CHOOSEN_ENV` | `development` | `development`, `test` ou `production`. |
| `CHOOSEN_DATABASE_URL` | `sqlite:///<backend>/choosen.db` | Banco próprio da autenticação. Se ausente, usa `DATABASE_URL` (nome do Render). |
| `CHOOSEN_SHARED_DATABASE_URL` | `sqlite:///<backend>/choosen_compartilhado.db` | Banco compartilhado (`choosen_compartilhado`). Só a infraestrutura usa esta URL. |
| `CHOOSEN_COMUNIDADES_DATABASE_URL` | `sqlite:///<backend>/choosen_comunidades.db` | Banco próprio das Comunidades. |
| `CHOOSEN_VIDEOS_DATABASE_URL` | `sqlite:///<backend>/choosen_videos.db` | Banco próprio dos Vídeos. |
| `CHOOSEN_BUSCA_LISTAS_DATABASE_URL` | `sqlite:///<backend>/choosen_busca_listas.db` | Banco próprio da Busca e Listas. |
| `CHOOSEN_HISTORICO_DATABASE_URL` | `sqlite:///<backend>/choosen_historico.db` | Banco próprio do Histórico. |
| `CHOOSEN_INFRA_URL` | (vazio) | Endereço da API de Dados Compartilhados. Vazio: os serviços a chamam no mesmo processo. Preenchido (ex.: `http://localhost:8000`): por HTTP, com as credenciais abaixo. |
| `CHOOSEN_CREDENCIAL_<SERVICO>` | (vazio) | Credencial de cada serviço na API HTTP (`AUTENTICACAO`, `COMUNIDADES`, `VIDEOS`, `BUSCA_LISTAS`, `HISTORICO`). O banco guarda só o SHA-256. Sem ela, o serviço não usa a API por HTTP. |
| `CHOOSEN_CORS_ORIGINS` | `http://localhost:5173` | Origens permitidas, separadas por vírgula (espaços nas pontas são ignorados). Se ausente, usa `CORS_ORIGINS`. |
| `CHOOSEN_SESSION_TTL_MINUTES` | `10080` (7 dias) | Validade da sessão em minutos, inteiro de 1 a 525600. |
| `CHOOSEN_FRONTEND_URL` | `http://localhost:5173` | Base do link de redefinição de senha. |

Todas as URLs de banco aceitam `postgres://` e `postgresql://`, convertidas para `postgresql+psycopg://`.

No frontend, `VITE_API_URL` é só o host do Backend (padrão `http://localhost:8000`); o frontend acrescenta `/api/v1`. Isso difere do texto do Requisito 12.1 (que põe `/api/v1` no padrão) por decisão do projeto, para seguir a mesma convenção de `frontend/src/2-comunidades/servico.js`.

## Modelo de dados

O sistema tem cinco microserviços. Cada um tem **um banco próprio**, que nenhum outro usa, e todos compartilham **um banco compartilhado**, de acesso controlado pela infraestrutura. Tudo em SQLAlchemy 2 (um `DeclarativeBase` por banco) com PostgreSQL; o SQLite fica só para o desenvolvimento local. O diagrama ER completo está no documento do grupo (`Modelo_de_Dados_Choosen.pdf`).

| Banco | Dono | Tabelas | Código |
|---|---|---|---|
| `choosen_autenticacao` | Autenticação | `usuario`, `sessao`, `token_redefinicao` | `app/autenticacao/modelo.py` |
| `choosen_comunidades` | Comunidades | `comunidade`, `nicho`, `participacao` | `app/comunidades/modelo.py` |
| `choosen_videos` | Vídeos | `video`, `curtida`, `comentario`, `reproducao` | `app/videos/modelo.py` |
| `choosen_busca_listas` | Busca e Listas | `lista`, `item_lista`, `indice_busca` | `app/busca_listas/modelo.py` |
| `choosen_historico` | Histórico | `visualizacao`, `preferencia_tempo` | `app/historico/modelo.py` |
| `choosen_compartilhado` | Infraestrutura | `usuario_publico`, `comunidade_publica`, `nicho_publico`, `video_publico`; `servico`, `permissao`, `assinatura`, `mensagem`, `entrega` | `app/infraestrutura/modelo.py` |

Todo banco próprio tem também `mensagem_enviada` (outbox: a mensagem é gravada na mesma transação da mudança e publicada depois do `commit`) e `mensagem_recebida` (ids já processados, para não aplicar a mesma mensagem duas vezes). Ver `app/mensageria/outbox.py`.

Referências para outro banco (por exemplo `lista.usuario_id`) são **lógicas**: guardam só o id, sem FK. Contadores (membros, curtidas, comentários) são derivados das tabelas de origem e chegam pré-calculados ao banco compartilhado por mensagem.

### Banco compartilhado e interface remota

- Nenhum serviço tem a URL do banco compartilhado. Cada um recebe um `ClienteDadosCompartilhados` (`app/infraestrutura/cliente.py`) com o próprio id. O cliente chama a **API de Dados Compartilhados** (`app/infraestrutura/dados.py`), que confere a tabela `permissao` antes de executar. Entra e sai só JSON.
- A mesma API é exposta por HTTP em `/api/v1/infra/dados/{tabela}` (`app/infraestrutura/api.py`), com os cabeçalhos `X-Servico` e `X-Credencial`: `GET /{tabela}?coluna=valor`, `GET /{tabela}/{chave}` e `PUT /{tabela}/{chave}` (só o dono). Credencial errada: 401; sem permissão: 403. Com `CHOOSEN_INFRA_URL`, os serviços usam esse caminho; sem ela, a chamada acontece no mesmo processo, com a mesma checagem de permissão.
- A matriz de acesso (dono de cada tabela e leitores) e as assinaturas de mensagens ficam em `app/infraestrutura/catalogo.py`. Elas são gravadas em `servico`, `permissao` e `assinatura` ao subir a API e no `python -m app.db.migrar`.

| Tabela compartilhada | Dono (escreve) | Leitores |
|---|---|---|
| `usuario_publico` | Autenticação | Comunidades, Vídeos, Busca e Listas, Histórico |
| `comunidade_publica`, `nicho_publico` | Comunidades | Vídeos, Busca e Listas |
| `video_publico` | Vídeos | Busca e Listas, Histórico, Comunidades |

### Mensagens

O barramento (`app/infraestrutura/barramento.py`) registra cada mensagem em `mensagem`, cria uma `entrega` por assinante e marca `entregue` ou `falhou` (com `tentativas`). Ele recusa mensagem de um serviço que não é o publicador daquele tipo. As entregas que falharam são tentadas de novo ao subir a API. Os consumidores rodam hoje no mesmo processo; um broker (RabbitMQ, Kafka) pode substituir a entrega sem mudar as tabelas.

| Mensagem | Publicada por | Assinantes | Efeito |
|---|---|---|---|
| `UsuarioCadastrado`, `PerfilAtualizado` | Autenticação | Infraestrutura | Grava `usuario_publico`. |
| `UsuarioRemovido` | Autenticação | Infraestrutura, Comunidades, Vídeos, Busca e Listas, Histórico | Remove `usuario_publico` e os dados do usuário em cada serviço. |
| `ComunidadeCriada`, `ComunidadeAtualizada` | Comunidades | Infraestrutura | Grava `comunidade_publica` e `nicho_publico`. |
| `MembroEntrou`, `MembroSaiu` | Comunidades | Infraestrutura | Atualiza `comunidade_publica.quantidade_membros`. |
| `VideoPublicado`, `VideoAtualizado`, `VideoRemovido` | Vídeos | Infraestrutura, Busca e Listas | Atualiza `video_publico` e o `indice_busca`. |
| `ReproducaoRegistrada` | Vídeos | Histórico | Soma a reprodução em `visualizacao`. |

Na autenticação, as mensagens de usuário saem de um evento `before_flush` (`app/autenticacao/mensagens.py`), então cadastro, edição de perfil, troca e redefinição de senha e semeadura publicam sem mudar `servico.py`. O conteúdo não tem e-mail, senha, sessões nem tokens.

### Diferenças em relação ao PDF

- `lista` tem chave `(usuario_id, id)` e `item_lista` leva `usuario_id`: o front gera o id e as listas iniciais têm ids fixos (`watch-later`...), iguais para todos os usuários.
- `indice_busca` também guarda `autor`, `thumbnail_url` e `publicado_em`, para a busca por autor e a ordem "em destaque" responderem sem chamada remota.
- As tabelas da autenticação continuam com `id` em `varchar(36)` e datas sem fuso (migration `0001`); as tabelas novas usam `uuid` e `timestamptz`.

## Banco e migrations

O esquema de cada banco é criado e alterado só pelo Alembic; o Backend não cria tabelas ao iniciar. Um comando aplica as migrations de todos os bancos e preenche `usuario_publico` com os usuários que já existem:

```powershell
python -m app.db.migrar
```

Com a configuração padrão, isso cria os seis arquivos SQLite em `backend/`. Cada banco tem o próprio ambiente do Alembic (seção do `alembic.ini`), que também pode ser rodado sozinho:

| Comando | Banco (variável) | Tabela de versão |
|---|---|---|
| `alembic upgrade head` | autenticação (`CHOOSEN_DATABASE_URL`) | `alembic_version` |
| `alembic -n compartilhado upgrade head` | compartilhado (`CHOOSEN_SHARED_DATABASE_URL`) | `alembic_version_compartilhado` |
| `alembic -n comunidades upgrade head` | `CHOOSEN_COMUNIDADES_DATABASE_URL` | `alembic_version_comunidades` |
| `alembic -n videos upgrade head` | `CHOOSEN_VIDEOS_DATABASE_URL` | `alembic_version_videos` |
| `alembic -n busca_listas upgrade head` | `CHOOSEN_BUSCA_LISTAS_DATABASE_URL` | `alembic_version_busca_listas` |
| `alembic -n historico upgrade head` | `CHOOSEN_HISTORICO_DATABASE_URL` | `alembic_version_historico` |

Exemplo com PostgreSQL (um banco por serviço no mesmo servidor):

```powershell
$base = "postgresql://usuario:senha@localhost"
$env:CHOOSEN_DATABASE_URL = "$base/choosen_autenticacao"
$env:CHOOSEN_SHARED_DATABASE_URL = "$base/choosen_compartilhado"
$env:CHOOSEN_COMUNIDADES_DATABASE_URL = "$base/choosen_comunidades"
$env:CHOOSEN_VIDEOS_DATABASE_URL = "$base/choosen_videos"
$env:CHOOSEN_BUSCA_LISTAS_DATABASE_URL = "$base/choosen_busca_listas"
$env:CHOOSEN_HISTORICO_DATABASE_URL = "$base/choosen_historico"
python -m app.db.migrar
```

Se só houver um banco PostgreSQL disponível (como no plano gratuito do Render), dê a cada serviço um schema próprio acrescentando `?options=-csearch_path%3D<schema>` à URL (por exemplo `.../choosen?options=-csearch_path%3Dcomunidades`). O schema é criado antes das migrations.

Para ver o SQL sem conectar, acrescente `--sql` a qualquer comando `alembic`.

`python -m app.autenticacao.republicar` publica de novo `PerfilAtualizado` para todos os usuários (o `migrar` já faz isso). Pode rodar quantas vezes for preciso: a infraestrutura ignora mensagem mais velha que a linha atual.

### Deploy (Render)

O comando de start do Render fica no painel, fora do repositório. Ele precisa rodar as migrations antes de subir o servidor:

```bash
python -m app.db.migrar && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Configure no Render as URLs dos seis bancos (ou os schemas, como acima). Sem elas, os outros serviços usam arquivos SQLite no disco do Render, que é apagado a cada deploy.

## Dados de demonstração

```powershell
python -m app.semear
```

Só roda com `CHOOSEN_ENV=development` (o padrão); em outro ambiente recusa e sai com código 1. Exige o esquema criado (`python -m app.db.migrar`). Cada serviço grava só no próprio banco, e o resto chega por mensagem:

- cria ou restaura `victor@email.com` / `choosen123` (nome `Victor Mendes`, username `victor`, `isCommunityAdmin` e `isSystemAdmin` verdadeiros), sem duplicar o registro;
- cria os autores dos vídeos de demonstração, contas que não entram no sistema (o `hash_senha` delas não é um hash válido);
- grava as três comunidades com seus nichos e publica os 15 vídeos do catálogo.

`python -m app.autenticacao.semear` cria só os usuários.

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

Estado inicial = bancos criados pelas migrations com só os dados de demonstração. Necessário para que duas execuções seguidas dos Testes_Selenium tenham o mesmo resultado. Pare o Backend antes (no Windows os arquivos podem ficar bloqueados enquanto o servidor tem conexões abertas):

```powershell
Remove-Item choosen*.db -ErrorAction SilentlyContinue
python -m app.db.migrar
python -m app.semear
```

(Com as variáveis `CHOOSEN_*_DATABASE_URL` apontando para PostgreSQL, apague e recrie esses bancos.)

Isso também apaga as contas criadas pelos testes, as sessões, as listas e o histórico.

## Testes_Selenium

Exigem o frontend em `http://localhost:5173`, o Backend em `http://localhost:8000` com `CHOOSEN_ENV=development` e os dados de demonstração semeados (de preferência com os bancos no estado inicial):

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

## Integração entre os microserviços

`app/plataforma.py` monta os cinco serviços: o banco próprio de cada um, o outbox ligado ao barramento, o consumidor de mensagens e o cliente da API de Dados Compartilhados. As rotas pegam o serviço em `request.app.state.plataforma`.

- Todo endpoint das partes 2 a 5 exige sessão: o router entra no `main.py` com `dependencies=[Depends(obter_usuario_atual)]`, ou o endpoint declara `usuario = Depends(obter_usuario_atual)` (sem sessão: `401 sessao_invalida`).
- De `app.autenticacao`, importar só `obter_usuario_atual` (de `app.autenticacao.api`) e `buscar_por_id` (de `app.autenticacao.servico`). Nunca ler `modelo.py` nem as tabelas `usuario` e `sessao` diretamente.
- Dados de outro serviço (nome e foto de um usuário, uma comunidade, um vídeo) vêm do banco compartilhado pelo cliente do próprio serviço, por exemplo `plataforma.clientes["videos"].listar("usuario_publico", usuario_id=[...])`. Só o que a `permissao` deixa.
- Mudança que outro serviço precisa saber vira mensagem: `outbox.registrar(sessao, tipo, chave, conteudo)` dentro da mesma transação, e o tipo entra em `app/infraestrutura/catalogo.py`. Um serviço nunca chama outro direto.
- Para decidir permissão (por exemplo, `isSystemAdmin`), usar `obter_usuario_atual`, que lê o banco próprio da autenticação. A cópia em `usuario_publico` pode estar atrasada.

```python
from fastapi import Depends
from app.autenticacao.api import obter_usuario_atual

app.include_router(meu_router, prefix="/api/v1", dependencies=[Depends(obter_usuario_atual)])
```

(Os routers de `historico`, `busca_listas` e `videos` já declaram `prefix="/api/v1"`; nesse caso, inclua sem `prefix`.)
