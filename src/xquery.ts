export type XQueryNode =
  | {
    k: 'lit';
    v: string | bigint | number | boolean | null;
    kind: 'str' | 'int' | 'real' | 'bool' | 'null' | 'date'
  }
  | {
    k: 'path';
    v: string;
    field: string
  }
  | {
    k: 'foreign';
    path: Extract<XQueryNode, { k: 'path' }>;
    field: string
  }
  | {
    k: 'func';
    name: string;
    args: XQueryNode[]
  }
  | {
    k: 'seq';
    items: XQueryNode[]
  }
  | {
    k: 'arith';
    op: string;
    l: XQueryNode;
    r: XQueryNode
  };

export type XQueryCondition =
  | {
    k: 'and' | 'or';
    l: XQueryCondition;
    r: XQueryCondition
  }
  | {
    k: 'cmp';
    op: string;
    l: XQueryNode;
    r: XQueryNode
  }
  | {
    k: 'bool';
    e: XQueryNode
  }
  | {
    k: 'some';
    vars: XQueryBinding[];
    cond: XQueryCondition
  };

export interface XQueryBinding {
  v: string;
  table: string
}

export interface XQueryOrder {
  e: XQueryNode | {
    k: 'hier';
    v: string;
    args: XQueryNode[]
  };
  desc: boolean
}

export interface XQueryFlwor {
  kind: 'flwor';
  binds: XQueryBinding[];
  where?: XQueryCondition;
  order: XQueryOrder[];
  ret: {
    v: string;
    fields?: string[];
    hier?: boolean
  };
  distinct: boolean;
}

export type XQuery =
  | XQueryFlwor
  | {
    kind: 'catalog';
    table: string;
  }
  | {
    kind: 'hierarchy';
    args: XQueryNode[];
  };

export class XQuerySyntaxError extends Error {
  constructor(message: string) {
    super(`XQuery: ${message}`);
    this.name = 'XQuerySyntaxError';
  }
}

interface Token {
  t: 'kw' | 'var' | 'id' | 'str' | 'num' | 'p';
  v: string
}

const keywords = new Set(['for', 'in', 'where', 'order', 'by', 'ascending', 'descending', 'return', 'some', 'satisfies', 'and', 'or', 'div', 'mod', 'distinct']);

function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source.charAt(index);

    if (/\s/.test(character)) {
      index++; continue;
    }

    if (character === "'" || character === '"') {
      let value = '';
      index++;

      for (; ;) {
        if (index >= source.length) {
          throw new XQuerySyntaxError('unterminated string');
        }

        if (source[index] === character) {
          if (source[index + 1] === character) {
            value += character; index += 2; continue;
          }

          index++;
          break;
        }

        value += source.charAt(index++);
      }

      tokens.push({
        t: 'str',
        v: value
      });
      continue;
    }

    if (character === '$') {
      const match = /^\$[A-Za-z_][\w]*/.exec(source.slice(index));

      if (!match) {
        throw new XQuerySyntaxError('variable expected');
      }

      tokens.push({
        t: 'var',
        v: match[0].slice(1)
      });
      index += match[0].length;
      continue;
    }

    const number = /^(0x[0-9a-fA-F]+|\d+(\.\d+)?)/.exec(source.slice(index));

    if (number) {
      tokens.push({
        t: 'num',
        v: number[0]
      }); index += number[0].length; continue;
    }

    const identifier = /^[A-Za-z_][\w.-]*/.exec(source.slice(index));

    if (identifier) {
      let value = identifier[0];

      if (value.includes('-') && !/^doc-contains/i.test(value)) {
        value = value.slice(0, value.indexOf('-'));
      }

      value = value.replace(/\.$/, '');
      tokens.push({
        t: keywords.has(value.toLowerCase()) ? 'kw' : 'id',
        v: keywords.has(value.toLowerCase()) ? value.toLowerCase() : value
      });
      index += value.length;
      continue;
    }

    const punctuation = ['!=', '<=', '>=', '=', '<', '>', '(', ')', ',', '/', '+', '-', '*'].find(value => source.startsWith(value, index));

    if (!punctuation) {
      throw new XQuerySyntaxError(`token '${character}' is unexpected`);
    }

    tokens.push({
      t: 'p',
      v: punctuation
    });
    index += punctuation.length;
  }

  return tokens;
}

class QueryParser {
  private readonly tokens: Token[];
  private index = 0;
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }
  private get current(): Token | undefined {
    return this.tokens[this.index];
  }
  private keyword(value: string): boolean {
    return this.current?.t === 'kw' && this.current.v === value;
  }
  private at(value: string): boolean {
    return this.current?.t === 'p' && this.current.v === value;
  }
  private eat(value: string): boolean {
    if (this.current?.v === value && (this.current.t === 'kw' || this.current.t === 'p')) {
      this.index++; return true;
    }

    return false;
  }
  private expect(value: string): void {
    if (!this.eat(value)) {
      throw new XQuerySyntaxError(`'${value}' was expected`);
    }
  }
  private next(): Token {
    const token = this.tokens[this.index++];

    if (!token) {
      throw new XQuerySyntaxError('unexpected end');
    }

    return token;
  }
  done(): boolean {
    return this.index >= this.tokens.length;
  }
  private bindings(): XQueryBinding[] {
    const bindings: XQueryBinding[] = [];
    do {
      const variable = this.next();

      if (variable.t !== 'var') {
        throw new XQuerySyntaxError('variable required in {flwor} statement');
      }

      this.expect('in');
      const table = this.next();

      if (table.t !== 'id') {
        throw new XQuerySyntaxError('catalog expected');
      }

      bindings.push({
        v: variable.v,
        table: table.v
      });
    } while (this.eat(','));
    return bindings;
  }
  flwor(): XQueryFlwor {
    this.expect('for');
    const binds = this.bindings();
    const where = this.eat('where') ? this.condition() : undefined;
    const order: XQueryOrder[] = [];

    if (this.eat('order')) {
      this.expect('by');
      do {
        let expression: XQueryOrder['e'];

        if (this.current?.t === 'var' && this.tokens[this.index + 1]?.v === '/' && /^Hier$/i.test(this.tokens[this.index + 2]?.v ?? '')) {
          const variable = this.next().v;
          this.next(); this.next();
          expression = {
            k: 'hier',
            v: variable,
            args: this.args()
          };
        } else {
          expression = this.operand();
        }

        const descending = this.eat('descending');

        if (!descending) {
          this.eat('ascending');
        }

        order.push({
          e: expression,
          desc: descending
        });
      } while (this.eat(','));
    }

    if (!this.keyword('return')) {
      throw new XQuerySyntaxError("expected 'return' in {flwor} statement");
    }

    this.next();
    const distinct = this.eat('distinct');
    const ret = this.returnList();
    return {
      kind: 'flwor',
      binds,
      ...(where ? { where } : {}),
      order,
      ret,
      distinct
    };
  }
  private returnList(): XQueryFlwor['ret'] {
    let variable: string | undefined;
    const fields: string[] = [];
    const parenthesized = this.eat('(');
    do {
      const token = this.next();

      if (token.t !== 'var') {
        throw new XQuerySyntaxError('return variable expected');
      }

      variable ??= token.v;

      if (this.eat('/')) {
        const field = this.next();

        if (/^Fields$/i.test(field.v) && this.eat('(')) {
          do {
            fields.push(this.next().v);
          } while (this.eat(','));
          this.expect(')');
        } else {
          fields.push(field.v);
        }
      }
    } while (this.eat(','));

    if (parenthesized) {
      const hier = this.eat(')') && this.done();
      this.index = this.tokens.length;
      return {
        v: variable,
        ...(hier || !fields.length ? {} : { fields }),
        hier
      };
    }

    return {
      v: variable,
      ...(fields.length ? { fields } : {})
    };
  }
  private condition(): XQueryCondition {
    let left = this.andCondition();

    while (this.eat('or')) {
      left = {
        k: 'or',
        l: left,
        r: this.andCondition()
      };
    }

    return left;
  }
  private andCondition(): XQueryCondition {
    let left = this.primaryCondition();

    while (this.eat('and')) {
      left = {
        k: 'and',
        l: left,
        r: this.primaryCondition()
      };
    }

    return left;
  }
  private primaryCondition(): XQueryCondition {
    if (this.eat('some')) {
      const vars = this.bindings();
      this.expect('satisfies');
      return {
        k: 'some',
        vars,
        cond: this.primaryCondition()
      };
    }

    if (this.at('(')) {
      const saved = this.index;
      this.next();
      try {
        const condition = this.condition();

        if (this.eat(')') && !this.isComparison()) {
          return condition;
        }
      } catch (error) {
        if (!(error instanceof XQuerySyntaxError)) {
          throw error;
        }
      }
      this.index = saved;
    }

    const left = this.operand();

    if (this.isComparison()) {
      return {
        k: 'cmp',
        op: this.next().v,
        l: left,
        r: this.operand()
      };
    }

    return {
      k: 'bool',
      e: left
    };
  }
  private isComparison(): boolean {
    return this.current?.t === 'p' && ['=', '!=', '<', '<=', '>', '>='].includes(this.current.v);
  }
  operand(): XQueryNode {
    let left = this.term();

    for (; ;) {
      const token = this.current;

      if (token && ((token.t === 'p' && ['+', '-', '*'].includes(token.v)) || (token.t === 'kw' && ['div', 'mod'].includes(token.v)))) {
        this.next();
        left = {
          k: 'arith',
          op: token.v,
          l: left,
          r: this.term()
        };
      } else {
        return left;
      }
    }
  }
  private term(): XQueryNode {
    const token = this.next();

    if (token.t === 'str') {
      if (/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?/.test(token.v) && !token.v.includes('.')) {
        return {
          k: 'lit',
          v: token.v.slice(0, 19),
          kind: 'date'
        };
      }

      return {
        k: 'lit',
        v: token.v,
        kind: 'str'
      };
    }

    if (token.t === 'num') {
      if (token.v.startsWith('0x')) {
        return {
          k: 'lit',
          v: BigInt.asIntN(64, BigInt(token.v)),
          kind: 'int'
        };
      }

      return token.v.includes('.') ? {
        k: 'lit',
        v: Number(token.v),
        kind: 'real'
      } : {
        k: 'lit',
        v: BigInt(token.v),
        kind: 'int'
      };
    }

    if (token.t === 'p' && token.v === '-') {
      const value = this.term();

      if (value.k === 'lit' && typeof value.v === 'bigint') {
        return {
          ...value,
          v: -value.v
        };
      }

      if (value.k === 'lit' && typeof value.v === 'number') {
        return {
          ...value,
          v: -value.v
        };
      }

      return {
        k: 'arith',
        op: '-',
        l: {
          k: 'lit',
          v: 0n,
          kind: 'int'
        },
        r: value
      };
    }

    if (token.t === 'p' && token.v === '(') {
      const items: XQueryNode[] = [];

      if (!this.eat(')')) {
        do {
          items.push(this.operand());
        } while (this.eat(','));
        this.expect(')');
      }

      const first = items[0];
      return items.length === 1 && first ? first : {
        k: 'seq',
        items
      };
    }

    if (token.t === 'var') {
      const segments: string[] = [];

      while (this.eat('/')) {
        segments.push(this.next().v);
      }

      if (!segments.length) {
        throw new XQuerySyntaxError('path expected');
      }

      return {
        k: 'path',
        v: token.v,
        field: segments.join('/')
      };
    }

    if (token.t === 'id') {
      if (!this.at('(')) {
        return {
          k: 'lit',
          v: token.v,
          kind: 'str'
        };
      }

      const args = this.args();
      const name = token.v.toLowerCase();

      if (name === 'true' || name === 'false') {
        return {
          k: 'lit',
          v: name === 'true',
          kind: 'bool'
        };
      }

      if (name === 'null') {
        return {
          k: 'lit',
          v: null,
          kind: 'null'
        };
      }

      if (name === 'foreignelem') {
        if (args[0]?.k !== 'path' || !this.eat('/')) {
          throw new XQuerySyntaxError('ForeignElem(path)/field expected');
        }

        return {
          k: 'foreign',
          path: args[0],
          field: this.next().v
        };
      }

      return {
        k: 'func',
        name,
        args
      };
    }

    throw new XQuerySyntaxError(`token '${token.v}' is unexpected`);
  }
  private args(): XQueryNode[] {
    this.expect('(');
    const args: XQueryNode[] = [];

    if (!this.eat(')')) {
      do {
        args.push(this.operand());
      } while (this.eat(','));
      this.expect(')');
    }

    return args;
  }
}

export function parseXQuery(source: string): XQuery {
  const query = source.trim();

  if (/^[A-Za-z_][\w.]*$/.test(query)) {
    return {
      kind: 'catalog',
      table: query
    };
  }

  const tokens = lex(query);
  const parser = new QueryParser(tokens);

  if (tokens[0]?.t === 'id' && /^CatalogHierSubset$/i.test(tokens[0].v)) {
    const expression = parser.operand();

    if (expression.k !== 'func') {
      throw new XQuerySyntaxError('hierarchy function expected');
    }

    if (!parser.done()) {
      throw new XQuerySyntaxError('unexpected tokens after hierarchy function');
    }

    return {
      kind: 'hierarchy',
      args: expression.args
    };
  }

  const result = parser.flwor();

  if (!parser.done()) {
    throw new XQuerySyntaxError('unexpected tokens after return');
  }

  return result;
}