# Jour

**Versão atual · 1.8.0**

O Jour é uma agenda instalável para acompanhar os compromissos da turma 13461/2026.6. Mostra onde é a atividade do dia, o horário e o próximo compromisso. A programação também pode ser consultada offline após o primeiro acesso.

[Abra o Jour](https://jour.portalnexo.workers.dev/) · [Histórico de versões](CHANGELOG.md)

## O que o Jour faz

- Consulta do dia, visão semanal e calendário mensal com Hospital, Senac, feriados e dias livres.
- Datas importantes, acompanhamento do contrato, aniversários e ajustes pessoais no dispositivo.
- Notificações Web Push opcionais, com horários por tipo de lembrete e Hora de sair por destino.
- Temas Claro, Escuro e Automático, cinco cores de destaque e quatro estilos do cartão de Hoje.
- Exportação e restauração de preferências, aniversários e ajustes em JSON. A inscrição de notificações é autorizada separadamente em cada dispositivo.

## Desenvolvimento local

Requer **Node.js 22.18 ou superior** e npm.

```sh
npm ci
npm run dev
```

Abra `http://localhost:3000`. Para conferir instalação e offline, use a compilação de produção e a prévia em loopback.

```sh
npm run build
npm run preview
```

Abra `http://127.0.0.1:3000`. A prévia funciona com o calendário e os dados locais mesmo sem Web Push configurado.

## Testes

```sh
npm test
npm run build
npm run typecheck
npm run cf:test
```

O build gera os tipos do Next.js e exporta o aplicativo em `out/`. Os testes cobrem calendário, backups, Service Worker e regras de agendamento. O teste do Worker roda em loopback com D1 local descartável e um provedor Push simulado, incluindo assinatura VAPID, criptografia, Cron, revogação e deduplicação.

## Arquitetura

| Parte | Implementação |
| --- | --- |
| Interface | Next.js com exportação estática, React, TypeScript e Tailwind CSS. |
| Offline e dados pessoais | Service Worker para os arquivos da PWA e IndexedDB para preferências, aniversários e ajustes. |
| Hospedagem e API | Cloudflare Workers com Static Assets e endpoints Web Push na mesma origem. |
| Agendamento | Cron a cada minuto, fila D1 e horários convertidos para `America/Sao_Paulo`. |
| Alternativa local | Servidor Node.js com SQLite. |

O Worker gera uma fila de sete dias por dispositivo, processa até quatro avisos prontos por disparo e registra cada ocorrência para evitar entregas duplicadas. O servidor guarda a inscrição e somente os dados necessários para programar os avisos. Nomes, anos de nascimento, títulos e observações pessoais ficam no dispositivo.

## Cloudflare Workers e D1

Copie [wrangler.example.jsonc](wrangler.example.jsonc) para `wrangler.jsonc` na raiz. O modelo contém uma base de exemplo para desenvolvimento local. O arquivo efetivo fica fora do Git.

```sh
npm run build
npm run cf:migrate:local
npm run cf:dev
```

Abra `http://127.0.0.1:8787`. Para disparar o Cron manualmente com o Worker local rodando, acesse `http://127.0.0.1:8787/cdn-cgi/local/scheduled?format=json`. Para configurar Push local, use [.dev.vars.example](.dev.vars.example) como modelo de `.dev.vars`.

Para hospedar **uma implantação própria**, autentique o Wrangler, crie o seu D1 e configure no seu `wrangler.jsonc` a binding `DB`, o ID da base e a origem HTTPS. Aplique as [migrações D1](worker/migrations) com `npm run cf:migrate:remote` e publique com `npm run cf:deploy`. Cadastre a chave privada como segredo do Worker com `npx wrangler secret put VAPID_PRIVATE_KEY`. Mantenha o par VAPID estável entre versões da mesma implantação.

| Variável | Uso |
| --- | --- |
| `APP_ORIGIN` | Origem exata do app, sem barra final. Use HTTPS em produção. |
| `VAPID_SUBJECT` | Contato do operador, no formato `mailto:` ou URL HTTPS pública. |
| `VAPID_PUBLIC_KEY` | Chave pública do par VAPID, em Base64 URL-safe. |
| `VAPID_PRIVATE_KEY` | Chave privada correspondente. Guarde em segredo do Worker ou no ambiente do servidor. |

Os limites de execução e armazenamento dependem do plano. [Workers](https://developers.cloudflare.com/workers/platform/limits/) · [D1](https://developers.cloudflare.com/d1/platform/pricing/) · [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

### Alternativa Node.js

Após o build, copie [.env.example](.env.example) para `.env` e execute `node --env-file=.env scripts/preview.mjs`. Para Web Push, configure as variáveis acima e mantenha `PUSH_DB_PATH` em armazenamento persistente, fora de `out/`. Use uma única instância atrás de um proxy HTTPS que preserve `Origin` e `Authorization`. O agendador Node roda a cada 15 segundos. O script [cf-export-node-push.mjs](scripts/cf-export-node-push.mjs) permite migrar o SQLite para D1. O SQL gerado contém inscrições e deve ficar em local privado.

## Agenda oficial e instalação

[data/schedule.json](data/schedule.json) é o calendário normalizado usado pelo app e pelos testes. O PDF original fica local. Para atualizar os dados com uma nova edição autorizada do PDF, instale `pdfplumber` e execute `python scripts/convert-calendar.py calendario-administrativo.pdf data/schedule.json`. Confira o resultado com os testes e gere um novo build.

No iPhone, abra o endereço HTTPS no Safari e use **Compartilhar → Adicionar à Tela de Início**. Abra o Jour pelo ícone. Em um iPhone com suporte a Web Push, **Ajustes → Notificações** permite conceder a permissão e enviar um aviso de teste.
