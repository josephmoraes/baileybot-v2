# BaileyBot V2

Plataforma web local para organizar clientes, templates, campanhas, mensagens e comissões, com integração ao WhatsApp por meio do Baileys. A aplicação foi desenhada para uma operação administrativa em um único computador, com dados persistidos em SQLite.

## Visão geral

- Dashboard executivo com indicadores operacionais e financeiros.
- Clientes com importação por PDF, Excel ou CSV e exportação Excel.
- Templates, envio individual e histórico pesquisável.
- Campanhas com destinatários, validação, intervalo aleatório, cancelamento e reenvio de falhas.
- Conexão WhatsApp com QR Code.
- Técnicos, comissões, importações por PDF, Excel ou CSV e solicitações de crédito.
- Configurações, bloqueio de contatos e backup do banco.

## Arquitetura

```text
Browser (Bootstrap + Hash Router)
        |
Express routes -> controllers -> services -> repositories
        |                            |
        +----------------------------+-> SQLite
                                     +-> Baileys / WhatsApp
```

Responsabilidades principais:

- `src/server/routes`: endpoints HTTP.
- `src/controllers`: tradução entre HTTP e regras da aplicação.
- `src/services`: regras de negócio e integrações.
- `src/repositories`: consultas de leitura agregada.
- `src/database`: conexão, schema, migrations e dados iniciais.
- `src/public`: interface SPA, páginas, estilos e scripts.
- `test`: testes automatizados com banco e autenticação temporários.

## Requisitos

- Node.js 20 ou superior.
- Windows, macOS ou Linux.
- Navegador moderno.

## Instalação

```bash
npm install
```

Crie um arquivo `.env` na raiz quando precisar sobrescrever os padrões:

```env
PORT=3000
HOST=127.0.0.1
ADMIN_PASSWORD=troque-por-uma-senha-forte
CAMPAIGN_DELAY_MIN_MS=60000
CAMPAIGN_DELAY_MAX_MS=180000
DAILY_MESSAGE_LIMIT=200
DB_PATH=./database/bot.db
AUTH_PATH=./auth_info
```

`ADMIN_PASSWORD` ativa a tela de login e protege todas as APIs administrativas por sessão. Sem essa variável, o servidor continua restrito por padrão a `127.0.0.1`, adequado para uso local. Não publique o serviço na internet sem senha, HTTPS e um proxy configurado.

## Como executar

Desenvolvimento:

```bash
npm run dev
```

Uso normal:

```bash
npm start
```

Acesse `http://127.0.0.1:3000/#/dashboard`.

## Qualidade e testes

```bash
npm test
npm run lint
npm run format:check
npm run check
```

Os testes usam `DB_PATH` e `AUTH_PATH` temporários e substituem o envio do WhatsApp. Eles não devem apontar para o banco ou para a sessão reais.

PDFs importados precisam conter texto selecionável e uma tabela com os mesmos cabeçalhos esperados nas planilhas. PDFs escaneados como imagem não passam por OCR.

## Banco e migrations

O schema base é criado de forma idempotente. Ajustes compatíveis com bancos existentes são registrados em `schema_migrations`; assim, uma atualização não recria nem apaga tabelas existentes. Antes de uma atualização importante, gere um backup em **Configurações**.

## Capturas

Adicione as capturas finais na pasta `docs/` com estes nomes:

- `docs/dashboard.png`
- `docs/campanhas.png`
- `docs/comissoes.png`

> As imagens devem ser capturadas com dados de demonstração, nunca com contatos reais.

## Segurança

- O servidor escuta apenas em `127.0.0.1` por padrão.
- APIs administrativas podem ser protegidas por sessão com `ADMIN_PASSWORD`.
- Cookies de sessão são `HttpOnly` e `SameSite=Strict`.
- Cabeçalhos básicos de proteção são aplicados pelo Express.
- Banco, backups, `.env` e credenciais do WhatsApp não devem ser versionados.
- Desconectar o WhatsApp remove a sessão salva e exige um novo QR Code.

## Roadmap

- [x] Operação local de clientes, mensagens e campanhas.
- [x] Dashboard executivo e módulo de comissões.
- [x] Navegação por URL e estrutura inicial de migrations.
- [ ] Capturas oficiais da apresentação.
- [ ] Auditoria de acessibilidade com usuários reais.
- [ ] Autenticação persistente com usuários e perfis, caso o sistema passe a ser multiusuário.

## Autor

Desenvolvido por **Joseph Moraes**.
