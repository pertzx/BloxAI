# [OPEN] explorer-sync

## Sintoma
- Explorer nao atualiza nem persiste no MongoDB.
- Plugin aparenta enviar, mas dashboard nao mostra dados reais.

## Hipoteses
- Payload do `FullSync` chega vazio ou invalido.
- Token JWT nao chega corretamente no `/sync`.
- Normalizacao do servidor descarta a arvore recebida.
- `workspaceNodes` salva com shape diferente do esperado pela web.
- `FullSync` nao dispara apos login/projeto autenticado.

## Plano
- Instrumentar plugin no ponto de coleta, agendamento e envio do `FullSync`.
- Instrumentar API `/projects/[id]/sync` na autenticacao, parse e persistencia.
- Instrumentar leitura da pagina do projeto para conferir shape recebido.

## Status
- Aguardando instrumentacao.

## Evidencias Coletadas
- Plugin coleta e envia `FullSync` com `rootCount=5` e `totalNodes=26`.
- `POST /api/projects/:id/sync` responde `200` com `workspaceNodeCount=26`.
- `GET /api/projects/:id` continua retornando `roots=0` e `totalNodes=0`.

## Hipotese Confirmada
- Inconsistencia de cache/schema do model `Project` no Mongoose em ambiente dev: uma rota operando com schema atualizado e outra com schema antigo, o que explica `sync` enxergar `workspaceNodes` e o `GET` nao.

## Fix Aplicado
- Recompilacao defensiva do model `Project` quando o model cacheado nao contem o campo `workspaceNodes`.
