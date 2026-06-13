# [OPEN] plugin-login-401

## Sintoma
- O plugin nao consegue mais logar.
- O Studio mostra `Erro ao logar: HTTP 401 (Unauthorized)`.

## Hipoteses
- A rota `/api/plugin/auth` esta rejeitando credenciais por divergencia entre email/senha enviados e os salvos no banco.
- O plugin esta enviando payload incompleto ou incorreto no login.
- O backend esta lendo o body, mas falhando no `bcrypt.compare` ou buscando o usuario errado.
- Alguma mudanca recente no fluxo de sync/modelo afetou indiretamente a rota de auth do plugin.

## Plano
- Instrumentar envio do login no plugin.
- Instrumentar a rota `/api/plugin/auth`.
- Comparar payload enviado, usuario encontrado e motivo exato do `401`.

## Status
- Aguardando instrumentacao.
