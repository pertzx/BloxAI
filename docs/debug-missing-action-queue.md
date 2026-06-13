# Debug Session: missing-action-queue

- Status: OPEN
- Data: 2026-06-06
- Sintoma: `Invariant: Missing ActionQueueContext` no `Router` do Next com erro de hydration.

## Hipoteses

1. Algum layout/root do App Router foi alterado para uma estrutura invalida e o `AppRouter` perdeu o provider interno esperado.
2. Existe mistura incorreta entre `pages/` e `app/` ou algum componente de roteamento do Next esta sendo renderizado fora da arvore correta.
3. Algum componente client-side no topo da arvore esta causando mismatch severo de hydration e quebrando a inicializacao do router.
4. Ha import/uso incorreto de APIs internas do Next ou uma sobreposicao em `layout.tsx`, `template.tsx`, `error.tsx` ou providers globais.
5. A pagina editada recentemente contem markup/comportamento que provoca substituicao completa do HTML e faz o router falhar durante a recuperacao.

## Plano

1. Inspecionar os arquivos raiz do App Router e providers.
2. Procurar por usos incomuns de router/layout e componentes client no topo.
3. Correlacionar com a tela do projeto alterada por ultimo.
4. Propor correcao minima apenas apos evidencias suficientes.

## Evidencias

- `frontend/src/app/layout.tsx` esta estruturalmente valido para App Router.
- Nao foi encontrado uso de APIs internas do Next no codigo da aplicacao.
- `frontend/package.json` usa `next: 14.2.3` junto com `react: ^18.3.1` e `react-dom: ^18.3.1`.
- `frontend/node_modules/next/package.json` declara `peerDependencies` de `react` e `react-dom` como `^18.2.0`.
- `frontend/node_modules/react/package.json` e `frontend/node_modules/react-dom/package.json` confirmam instalacao real em `18.3.1`.

## Conclusao Atual

- Hipoteses 1, 2 e 4 perderam forca com a inspeção estatica inicial.
- A hipotese mais forte e confirmada por evidencias locais e incompatibilidade de versoes entre `next 14.2.3` e `react/react-dom 18.3.1`.
- Correcao aplicada no manifesto: alinhar `react` e `react-dom` para `18.2.0`.
- Dependencias reinstaladas no `frontend`.
- Verificacao local apos reinstall: `next@14.2.3`, `react@18.2.0`, `react-dom@18.2.0`.
- O erro persistiu mesmo apos reinstall e restart informado pelo usuario.
- Nova evidencia: `.next` continha artefatos de hot-update e cache de dev antigos.
- Acao aplicada: limpeza do cache de build em `frontend/.next`.
- Proximo passo: subir ou reiniciar o dev server com cache limpo e validar novamente.
