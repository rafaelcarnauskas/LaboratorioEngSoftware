# LaboratorioEngSoftware

Projeto de PCS3642 - Laboratório de Engenharia de Software I (2026).

## Aplicação integrada

A versão integrada reúne Home, Profile, My Time, History, Lists e Search da
branch `victor`, os Reels de `murilo/reels` e os testes Selenium dos dois autores.
Os dados são de demonstração; as listas são salvas no navegador.

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
python -m venv frontend/.venv
./frontend/.venv/Scripts/python.exe -m pip install -r selenium/requirements.txt
./frontend/.venv/Scripts/python.exe frontend/run_selenium.py
```

Use `py` no primeiro comando se esse for o comando Python disponível. Se nenhum
for reconhecido, instale Python com a opção de adicioná-lo ao PATH, ou substitua
`python` pelo caminho completo de uma instalação válida. Não é necessário ativar
o ambiente virtual. A pasta `.venv` é local e não deve ser versionada nem copiada
entre máquinas. Na primeira execução, o Selenium Manager pode precisar de
internet para obter o driver compatível com o Chrome.

O runner executa as duas suítes e os testes de integração, retornando código 1
se algum teste falhar. Cada teste usa uma sessão nova do navegador.

Para rodar sem abrir janelas, ou apontar para outro endereço:

```powershell
$env:HEADLESS = '1'
$env:URL_APP = 'http://localhost:5173'
./frontend/.venv/Scripts/python.exe frontend/run_selenium.py
```

Para executar separadamente:

```powershell
./frontend/.venv/Scripts/python.exe frontend/test_selenium.py
./frontend/.venv/Scripts/python.exe selenium/test_reels.py
```

- Victor: Home, Profile, My Time, History e criação/validação de Lists.
- Murilo: comentários válidos/inválidos e navegação por teclado nos Reels.
- Integração: Home → Reels → Home → Lists → Search e salvar um resultado de
  Search em uma nova lista.

As novas capturas ficam em `frontend/test-results/selenium/victor/` (ignorado pelo
Git). As capturas anteriores em `frontend/selenium_evidencias/` foram preservadas.

## Verificações do frontend

```powershell
cd frontend
npm run lint
npm run build
```
