/**
 * Validador estrutural de Luau (sem executar nada).
 *
 * Não é um parser completo, mas pega de forma confiável os modos de falha reais
 * de código gerado por LLM: strings/long-brackets/comentários não terminados,
 * parênteses/chaves/colchetes desbalanceados e blocos function/if/for/while/do
 * sem o `end` correspondente (o que normalmente indica truncamento).
 *
 * Política de uso (ver AgentOrchestrator.validateAndRepairExecutions):
 *  - hardErrors  → código DEFINITIVAMENTE quebrado (string/bracket aberto). Se
 *                  persistir após reparo, NÃO enfileira (evita erro no Studio).
 *  - softWarnings→ heurística de blocos (function/end). Pode dar falso positivo
 *                  em casos raros, então só dispara reparo; nunca bloqueia sozinho.
 */
export class LuauValidator {
  static validate(source) {
    const text = String(source || '');
    const hardErrors = [];
    const softWarnings = [];

    if (!text.trim()) {
      return { ok: false, hardErrors: ['Source Luau vazio.'], softWarnings: [] };
    }

    const n = text.length;
    let i = 0;
    let paren = 0;
    let brace = 0;
    let bracket = 0;
    let expectedEnds = 0;
    let repeatDepth = 0;
    let pendingDo = 0; // for/while aguardando o `do` que os acompanha

    while (i < n) {
      const c = text[i];

      // Comentários (-- linha) ou (--[[ ... ]] / --[=[ ... ]=] longo)
      if (c === '-' && text[i + 1] === '-') {
        const lb = this.matchLongBracketOpen(text, i + 2);
        if (lb) {
          const close = this.findLongBracketClose(text, lb.contentStart, lb.level);
          if (close === -1) {
            hardErrors.push('Comentário longo não terminado (--[[ ... ]]).');
            return this.result(hardErrors, softWarnings);
          }
          i = close;
          continue;
        }
        let j = i + 2;
        while (j < n && text[j] !== '\n') j += 1;
        i = j;
        continue;
      }

      // Long string [[ ... ]] / [=[ ... ]=]
      if (c === '[') {
        const lb = this.matchLongBracketOpen(text, i);
        if (lb) {
          const close = this.findLongBracketClose(text, lb.contentStart, lb.level);
          if (close === -1) {
            hardErrors.push('String longa não terminada ([[ ... ]] ou [=[ ... ]=]).');
            return this.result(hardErrors, softWarnings);
          }
          i = close;
          continue;
        }
        bracket += 1;
        i += 1;
        continue;
      }
      if (c === ']') { bracket -= 1; i += 1; continue; }

      // Strings entre aspas
      if (c === '"' || c === "'") {
        const j = this.skipQuoted(text, i);
        if (j === -1) {
          hardErrors.push(`String entre aspas (${c}) não terminada ou com quebra de linha crua.`);
          return this.result(hardErrors, softWarnings);
        }
        i = j;
        continue;
      }

      if (c === '(') { paren += 1; i += 1; continue; }
      if (c === ')') { paren -= 1; i += 1; continue; }
      if (c === '{') { brace += 1; i += 1; continue; }
      if (c === '}') { brace -= 1; i += 1; continue; }

      // Palavras / palavras-chave
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_]/.test(text[j])) j += 1;
        const word = text.slice(i, j);
        i = j;

        switch (word) {
          case 'function':
          case 'if':
            expectedEnds += 1;
            break;
          case 'for':
          case 'while':
            expectedEnds += 1;
            pendingDo += 1;
            break;
          case 'do':
            if (pendingDo > 0) pendingDo -= 1; // `do` do for/while não abre bloco extra
            else expectedEnds += 1; // `do ... end` autônomo
            break;
          case 'repeat':
            repeatDepth += 1;
            break;
          case 'until':
            if (repeatDepth > 0) repeatDepth -= 1;
            break;
          case 'end':
            expectedEnds -= 1;
            break;
          default:
            break;
        }
        continue;
      }

      i += 1;
    }

    if (paren !== 0) hardErrors.push(`Parênteses () desbalanceados (${paren > 0 ? `faltam ${paren} ')'` : `${-paren} ')' a mais`}).`);
    if (brace !== 0) hardErrors.push(`Chaves {} desbalanceadas (${brace > 0 ? `faltam ${brace} '}'` : `${-brace} '}' a mais`}).`);
    if (bracket !== 0) hardErrors.push(`Colchetes [] desbalanceados (${bracket > 0 ? `faltam ${bracket} ']'` : `${-bracket} ']' a mais`}).`);
    if (repeatDepth !== 0) softWarnings.push('Bloco repeat/until possivelmente incompleto.');
    if (expectedEnds > 0) softWarnings.push(`Faltam ${expectedEnds} 'end' para fechar blocos (function/if/for/while/do).`);
    else if (expectedEnds < 0) softWarnings.push(`Há ${Math.abs(expectedEnds)} 'end' a mais do que blocos abertos.`);

    return this.result(hardErrors, softWarnings);
  }

  static result(hardErrors, softWarnings) {
    return {
      ok: hardErrors.length === 0 && softWarnings.length === 0,
      hardErrors,
      softWarnings,
    };
  }

  static skipQuoted(text, start) {
    const quote = text[start];
    let i = start + 1;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') return -1; // string curta não pode ter newline cru
      if (c === quote) return i + 1;
      i += 1;
    }
    return -1;
  }

  static matchLongBracketOpen(text, pos) {
    if (text[pos] !== '[') return null;
    let i = pos + 1;
    let level = 0;
    while (text[i] === '=') { level += 1; i += 1; }
    if (text[i] === '[') {
      return { level, contentStart: i + 1 };
    }
    return null;
  }

  static findLongBracketClose(text, start, level) {
    const closer = `]${'='.repeat(level)}]`;
    const idx = text.indexOf(closer, start);
    return idx === -1 ? -1 : idx + closer.length;
  }
}
