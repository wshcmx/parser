export interface SqlToken {
  k: 'str' | 'qid' | 'word' | 'num' | 'var' | 'op';
  v: string;
  at?: number;
}

export type SqlNode = SqlToken | {
  k: 'group';
  items: SqlNode[]
};

export class SqlSyntaxError extends Error {
  constructor(message: string) {
    super(`SQL: ${message}`);
    this.name = 'SqlSyntaxError';
  }
}

export function tokenizeSql(source: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source.charAt(index);

    if (/\s/.test(character)) {
      index++; continue;
    }

    if (character === '-' && source[index + 1] === '-') {
      while (index < source.length && source[index] !== '\n') {
        index++;
      }

      continue;
    }

    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }

    const at = index;

    if (character === "'" || ((character === 'N' || character === 'n') && source[index + 1] === "'")) {
      if (character !== "'") {
        index++;
      }

      index++;
      let value = '';

      for (; ;) {
        if (index >= source.length) {
          throw new SqlSyntaxError('unclosed quotation mark');
        }

        if (source[index] === "'") {
          if (source[index + 1] === "'") {
            value += "'"; index += 2; continue;
          }

          index++; break;
        }

        value += source.charAt(index++);
      }

      tokens.push({
        k: 'str',
        v: value,
        at
      });
      continue;
    }

    if (character === '[' || character === '"') {
      const close = character === '[' ? ']' : '"';
      let value = '';
      index++;

      for (; ;) {
        if (index >= source.length) {
          throw new SqlSyntaxError('unclosed identifier');
        }

        if (source[index] === close) {
          if (source[index + 1] === close) {
            value += close; index += 2; continue;
          }

          index++; break;
        }

        value += source.charAt(index++);
      }

      tokens.push({
        k: 'qid',
        v: value,
        at
      });
      continue;
    }

    const rest = source.slice(index);
    const variable = /^@@?[\p{L}\w#$]+/u.exec(rest);

    if (variable) {
      tokens.push({
        k: 'var',
        v: variable[0].toLowerCase(),
        at
      }); index += variable[0].length; continue;
    }

    const number = /^(\d+(\.\d*)?([eE][+-]?\d+)?|\.\d+)/.exec(rest);

    if (number) {
      tokens.push({
        k: 'num',
        v: number[0],
        at
      }); index += number[0].length; continue;
    }

    const word = /^[\p{L}_#][\p{L}\p{N}_#$]*/u.exec(rest);

    if (word) {
      tokens.push({
        k: 'word',
        v: word[0],
        at
      }); index += word[0].length; continue;
    }

    const operator = ['::', '<>', '!=', '<=', '>=', '||', '!<', '!>'].find(value => source.startsWith(value, index)) ?? character;
    tokens.push({
      k: 'op',
      v: operator,
      at
    });
    index += operator.length;
  }

  return tokens;
}

export function groupSqlTokens(tokens: readonly SqlToken[]): SqlNode[] {
  const root: SqlNode[] = [];
  const stack: SqlNode[][] = [root];

  for (const token of tokens) {
    if (token.k === 'op' && token.v === '(') {
      stack.push([]); continue;
    }

    if (token.k === 'op' && token.v === ')') {
      if (stack.length === 1) {
        throw new SqlSyntaxError("incorrect syntax near ')'");
      }

      const items = stack.pop();
      const parent = stack.at(-1);

      if (items && parent) {
        parent.push({
          k: 'group',
          items
        });
      }

      continue;
    }

    stack.at(-1)?.push(token);
  }

  if (stack.length !== 1) {
    throw new SqlSyntaxError("incorrect syntax near '('");
  }

  return root;
}

export function splitSqlStatements(nodes: readonly SqlNode[]): SqlNode[][] {
  const statements: SqlNode[][] = [];
  let current: SqlNode[] = [];
  let topSelect = false;
  const isWord = (node: SqlNode | undefined, ...names: string[]): boolean => node?.k === 'word' && names.includes(node.v.toLowerCase());
  const starters = new Set(['insert', 'update', 'delete', 'exec', 'execute', 'create', 'drop', 'alter', 'truncate', 'merge', 'declare']);
  const flush = (): void => {
    if (current.length) {
      statements.push(current);
    }

    current = [];
    topSelect = false;
  };

  for (const [index, node] of nodes.entries()) {
    if (node.k === 'op' && node.v === ';') {
      flush(); continue;
    }

    if (current.length && node.k === 'word') {
      const previous = current.at(-1);
      const first = current[0];
      const name = node.v.toLowerCase();
      let boundary = starters.has(name) && !isWord(previous, 'for', 'on');

      if (name === 'select') {
        boundary = !isWord(previous, 'union', 'all', 'except', 'intersect', 'as') && !((isWord(first, 'insert', 'with')) && !topSelect);
      }

      if (name === 'with') {
        const next = nodes[index + 1];
        boundary = (next?.k === 'word' || next?.k === 'qid') && !isWord(next, 'ties') && (isWord(nodes[index + 2], 'as') || nodes[index + 2]?.k === 'group');
      }

      if (boundary) {
        flush();
      }
    }

    if (isWord(node, 'select')) {
      topSelect = true;
    }

    current.push(node);
  }

  flush();
  return statements;
}