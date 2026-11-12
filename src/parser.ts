import type {
  Assignable, BlockStatement, CatchClause, Expression, FunctionDeclaration, Identifier, Node,
  Program, Property, Statement, SwitchCase, VariableDeclaration, VariableDeclarator,
} from './ast.ts';
import { ParserSyntaxError, type DiagnosticCode, type ParseOptions, type SourceSpan } from './diagnostics.ts';
import { tokenize, type Token } from './lexer.ts';

const assignments = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '>>>=', '&=', '|=', '^=']);
const keywords = new Set([
  'var', 'function', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break',
  'continue', 'return', 'throw', 'try', 'catch', 'finally', 'with', 'new', 'this', 'true', 'false',
  'null', 'typeof', 'delete', 'instanceof', 'void',
]);
const unaryOperators: ReadonlySet<string> = new Set(['!', '~', '-', 'typeof', 'delete', 'void']);
const literalKeywords: ReadonlySet<string> = new Set(['true', 'false', 'null', 'undefined']);
const objectKeyKinds: ReadonlySet<string> = new Set(['identifier', 'string', 'integer']);
const restrictedLiteralKinds: ReadonlySet<string> = new Set(['integer', 'real', 'string']);
const precedence = new Map<string, number>([
  [',', 1], ...[...assignments].map(operator => [operator, 2] as [string, number]), ['?', 3],
  ['||', 4], ['&&', 5], ['|', 6], ['^', 7], ['&', 8], ['==', 9], ['!=', 9], ['===', 9], ['!==', 9],
  ['<', 10], ['>', 10], ['<=', 10], ['>=', 10], ['instanceof', 10],
  ['<<', 11], ['>>', 11], ['>>>', 11], ['+', 12], ['-', 12], ['*', 13], ['/', 13], ['%', 13],
]);

class SyntaxParser {
  private cursor = 0;
  private readonly tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private get current(): Token {
    const token = this.tokens[this.cursor];

    if (!token) {
      throw new Error('Parser cursor is outside the token stream');
    }

    return token;
  }

  private get previous(): Token {
    const token = this.tokens[Math.max(0, this.cursor - 1)];

    if (!token) {
      throw new Error('Parser token stream is empty');
    }

    return token;
  }

  private at(text: string): boolean {
    return this.current.text === text && this.current.kind !== 'eof';
  }
  private take(): Token {
    const token = this.current;

    if (token.kind !== 'eof') {
      this.cursor++;
    }

    return token;
  }
  private match(text: string): boolean {
    if (!this.at(text)) {
      return false;
    }

    this.take(); return true;
  }
  private error(message: string, code: DiagnosticCode = 'UNEXPECTED_TOKEN', token = this.current): never {
    throw new ParserSyntaxError(code, message, token.span);
  }

  private expect(text: string): Token {
    if (!this.at(text)) {
      this.error(`Expected ${JSON.stringify(text)}, received ${this.current.kind === 'eof' ? 'end of source' : JSON.stringify(this.current.text)}`);
    }

    return this.take();
  }

  private span(start: Token | Node, end: Token | Node = this.previous): SourceSpan {
    return {
      sourceName: start.span.sourceName,
      start: start.span.start,
      end: end.span.end
    };
  }

  private identifier(): Identifier {
    if (this.current.kind !== 'identifier' || keywords.has(this.current.text)) {
      this.error('Expected an identifier');
    }

    const token = this.take();
    return {
      type: 'Identifier',
      name: token.text,
      span: token.span
    };
  }

  private terminator(): void {
    this.match(';');
  }

  private assignable(expression: Expression): Assignable {
    if (expression.type === 'Identifier' || expression.type === 'MemberExpression') {
      return expression;
    }

    if (expression.type === 'ParenthesizedExpression') {
      this.assignable(expression.expression); return expression;
    }

    throw new ParserSyntaxError('INVALID_ASSIGNMENT', 'Expected an assignable identifier or member', expression.span);
  }

  program(): Program {
    const first = this.current;
    const body: Statement[] = [];

    while (this.current.kind !== 'eof') {
      body.push(this.statement());
    }

    return {
      type: 'Program',
      body,
      span: this.span(first, this.current)
    };
  }
  private block(): BlockStatement {
    const start = this.expect('{');
    const body: Statement[] = [];

    while (!this.at('}')) {
      if (this.current.kind === 'eof') {
        this.error('Expected "}" before end of source');
      }

      body.push(this.statement());
    }

    this.expect('}');
    return {
      type: 'BlockStatement',
      body,
      span: this.span(start)
    };
  }

  private condition(): Expression {
    this.expect('(');
    const expression = this.expression();
    this.expect(')');
    return expression;
  }

  private variable(): VariableDeclaration {
    const start = this.expect('var');
    const declarations: VariableDeclarator[] = [];
    do {
      const id = this.identifier();
      const init = this.match('=') ? this.expression() : null;
      declarations.push({
        type: 'VariableDeclarator',
        id,
        init,
        span: this.span(id)
      });

      if (init) {
        break;
      }
    } while (this.match(','));

    return {
      type: 'VariableDeclaration',
      declarations,
      span: this.span(start)
    };
  }

  private functionDeclaration(): FunctionDeclaration {
    const start = this.expect('function');
    const id = this.identifier();
    this.expect('(');
    const params: Identifier[] = [];

    if (!this.at(')')) {
      do {
        params.push(this.identifier());
      } while (this.match(','));
    }

    this.expect(')');
    const body = this.block();
    return {
      type: 'FunctionDeclaration',
      id,
      params,
      body,
      span: this.span(start)
    };
  }

  private statement(): Statement {
    const start = this.current;

    if (this.at('{')) {
      return this.block();
    }

    if (this.match(';')) {
      return {
        type: 'EmptyStatement',
        span: start.span
      };
    }

    if (this.at('function')) {
      return this.functionDeclaration();
    }

    if (this.at('var')) {
      const declaration = this.variable();
      this.terminator();
      return {
        ...declaration,
        span: this.span(start)
      };
    }

    if (this.match('return')) {
      const argument = this.at(';') || this.at('}') || this.current.kind === 'eof' || this.current.lineBreakBefore ? null : this.expression();
      this.terminator();
      return {
        type: 'ReturnStatement',
        argument,
        span: this.span(start)
      };
    }

    if (this.match('throw')) {
      const argument = this.expression(); this.terminator();
      return {
        type: 'ThrowStatement',
        argument,
        span: this.span(start)
      };
    }

    if (this.match('if')) {
      const test = this.condition();
      const consequent = this.statement();
      const alternate = this.match('else') ? this.statement() : null;
      return {
        type: 'IfStatement',
        test,
        consequent,
        alternate,
        span: this.span(start)
      };
    }

    if (this.match('while')) {
      const test = this.condition(); const body = this.statement();
      return {
        type: 'WhileStatement',
        test,
        body,
        span: this.span(start)
      };
    }

    if (this.match('do')) {
      const body = this.statement(); this.expect('while');
      const test = this.condition(); this.terminator();
      return {
        type: 'DoWhileStatement',
        body,
        test,
        span: this.span(start)
      };
    }

    if (this.match('for')) {
      return this.forStatement(start);
    }

    if (this.match('break') || this.match('continue')) {
      this.terminator();
      return {
        type: start.text === 'break' ? 'BreakStatement' : 'ContinueStatement',
        span: this.span(start)
      };
    }

    if (this.match('switch')) {
      return this.switchStatement(start);
    }

    if (this.match('try')) {
      const block = this.block();
      const catchStart = this.expect('catch');
      this.expect('('); const param = this.identifier(); this.expect(')');
      const body = this.block();
      const handler: CatchClause = {
        type: 'CatchClause',
        param,
        body,
        span: this.span(catchStart)
      };
      const finalizer = this.match('finally') ? this.block() : null;
      return {
        type: 'TryStatement',
        block,
        handler,
        finalizer,
        span: this.span(start)
      };
    }

    if (this.match('with')) {
      const object = this.condition(); const body = this.statement();
      return {
        type: 'WithStatement',
        object,
        body,
        span: this.span(start)
      };
    }

    if (this.current.kind === 'identifier' && this.tokens[this.cursor + 1]?.text === ':') {
      this.error('Labels are not supported', 'UNSUPPORTED_SYNTAX');
    }

    const expression = this.expression(); this.terminator();

    return {
      type: 'ExpressionStatement',
      expression,
      span: this.span(start)
    };
  }
  private forStatement(start: Token): Statement {
    this.expect('(');

    const leftOffset = this.at('var') ? 1 : 0;
    const leftToken = this.tokens[this.cursor + leftOffset];

    if (leftToken?.kind === 'identifier' && !keywords.has(leftToken.text) && this.tokens[this.cursor + leftOffset + 1]?.text === 'in') {
      this.match('var');
      const left = this.identifier(); this.expect('in');
      const right = this.expression(); this.expect(')');
      const body = this.statement();
      return {
        type: 'ForInStatement',
        left,
        right,
        body,
        span: this.span(start)
      };
    }

    const init = this.at(';') ? null : this.at('var') ? this.variable() : this.expression();
    this.expect(';');
    const test = this.at(';') ? null : this.expression(); this.expect(';');
    const update = this.at(')') ? null : this.expression(); this.expect(')');
    const body = this.statement();

    return {
      type: 'ForStatement',
      init,
      test,
      update,
      body,
      span: this.span(start)
    };
  }
  private switchStatement(start: Token): Statement {
    const discriminant = this.condition(); this.expect('{');
    const cases: SwitchCase[] = [];
    let hasDefault = false;

    while (!this.at('}')) {
      const caseStart = this.current;
      let test: Expression | null;

      if (this.match('case')) {
        test = this.expression();
        const key = this.caseKey(test);

        if (key !== undefined && cases.some(clause => this.caseKey(clause.test) === key)) {
          this.error('Duplicate case clause');
        }
      } else {
        this.expect('default');

        if (hasDefault) {
          this.error('Duplicate default clause', 'UNEXPECTED_TOKEN', caseStart);
        }

        hasDefault = true; test = null;
      }

      this.expect(':');
      const consequent: Statement[] = [];

      while (!this.at('case') && !this.at('default') && !this.at('}')) {
        if (this.current.kind === 'eof') {
          this.error('Unterminated switch statement');
        }

        consequent.push(this.statement());
      }

      cases.push({
        type: 'SwitchCase',
        test,
        consequent,
        span: this.span(caseStart)
      });
    }

    this.expect('}');
    return {
      type: 'SwitchStatement',
      discriminant,
      cases,
      span: this.span(start)
    };
  }

  private caseKey(expression: Expression | null): string | number | undefined {
    if (expression?.type === 'ParenthesizedExpression') {
      return this.caseKey(expression.expression);
    }

    if (expression?.type !== 'Literal') {
      return undefined;
    }

    if (expression.kind === 'integer' || expression.kind === 'real') {
      return Number(expression.kind === 'integer' ? BigInt.asIntN(64, BigInt(expression.raw)) : expression.raw);
    }

    return expression.kind === 'string' ? `s:${String(expression.value)}` : undefined;
  }

  private expression(minimum = 1): Expression {
    let left = this.prefix();

    for (; ;) {
      const operator = this.current.text;
      const binding = this.current.kind === 'eof' ? undefined : precedence.get(operator);

      if (binding === undefined || binding < minimum) {
        break;
      }

      this.take();

      if (operator === '?') {
        const consequent = this.expression(2); this.expect(':');
        const alternate = this.expression();
        left = {
          type: 'ConditionalExpression',
          test: left,
          consequent,
          alternate,
          span: this.span(left)
        };
      } else {
        if (binding === 13 && this.match('-')) {
          const minus = this.previous;
          const argument = this.prefix();
          const right: Expression = {
            type: 'UnaryExpression',
            operator: '-',
            argument,
            span: this.span(minus)
          };
          left = {
            type: 'BinaryExpression',
            operator: '-',
            left,
            right,
            span: this.span(left)
          };
          continue;
        }

        const isAssignment = assignments.has(operator);
        const right = this.expression(isAssignment ? binding : binding + 1);

        if (isAssignment) {
          left = {
            type: 'AssignmentExpression',
            operator,
            left: this.assignable(left),
            right,
            span: this.span(left)
          };
        } else if (operator === ',') {
          left = {
            type: 'SequenceExpression',
            expressions: left.type === 'SequenceExpression' ? [...left.expressions, right] : [left, right],
            span: this.span(left)
          };
        } else {
          left = {
            type: 'BinaryExpression',
            operator,
            left,
            right,
            span: this.span(left)
          };
        }
      }
    }

    return left;
  }
  private prefix(): Expression {
    const start = this.current;

    if (start.text === 'function') {
      this.error('Function expressions are not supported', 'UNSUPPORTED_SYNTAX');
    }

    if (unaryOperators.has(start.text)) {
      this.take(); const argument = this.prefix();
      return {
        type: 'UnaryExpression',
        operator: start.text,
        argument,
        span: this.span(start)
      };
    }

    if (start.text === '++' || start.text === '--') {
      this.take();
      const argument = this.assignable(this.prefix());
      return {
        type: 'UpdateExpression',
        operator: start.text,
        argument,
        prefix: true,
        span: this.span(start)
      };
    }

    if (this.match('new')) {
      let callee: Expression = this.identifier();

      while (this.match('.')) {
        const property = this.identifier();
        callee = {
          type: 'MemberExpression',
          object: callee,
          property,
          computed: false,
          span: this.span(callee)
        };
      }

      const args = this.at('(') ? this.arguments() : [];
      return this.postfix({
        type: 'NewExpression',
        callee,
        arguments: args,
        span: this.span(start)
      });
    }

    return this.postfix(this.primary());
  }
  private primary(): Expression {
    const token = this.current;

    if (token.kind === 'integer' || token.kind === 'real' || token.kind === 'string') {
      this.take();
      const value = token.kind === 'string' ? token.value : token.text;

      if (value === undefined) {
        throw new Error('String token is missing its decoded value');
      }

      return {
        type: 'Literal',
        kind: token.kind,
        raw: token.text,
        value,
        span: token.span
      };
    }

    if (literalKeywords.has(token.text)) {
      this.take();

      if (token.text === 'true' || token.text === 'false') {
        return {
          type: 'Literal',
          kind: 'boolean',
          value: token.text === 'true',
          raw: token.text,
          span: token.span
        };
      }

      if (token.text === 'null' || token.text === 'undefined') {
        return {
          type: 'Literal',
          kind: token.text,
          raw: token.text,
          ...(token.text === 'null' ? { value: null } : {}),
          span: token.span
        };
      }

      this.error('Expected a literal keyword');
    }

    if (this.match('this')) {
      return {
        type: 'ThisExpression',
        span: token.span
      };
    }

    if (token.kind === 'identifier') {
      return this.identifier();
    }

    if (this.match('(')) {
      const expression = this.expression(); this.expect(')');
      return {
        type: 'ParenthesizedExpression',
        expression,
        span: this.span(token)
      };
    }

    if (this.match('[')) {
      const elements: Expression[] = [];

      while (!this.at(']')) {
        elements.push(this.expression(2));

        if (!this.match(',')) {
          break;
        }
      }

      this.expect(']');
      return {
        type: 'ArrayExpression',
        elements,
        span: this.span(token)
      };
    }

    if (this.match('{')) {
      const properties: Property[] = [];

      while (!this.at('}')) {
        const key = this.current;

        if (!objectKeyKinds.has(key.kind)) {
          this.error('Expected an object property name');
        }

        this.take(); this.expect(':');
        const value = this.expression(2);
        properties.push({
          type: 'Property',
          key: key.value ?? key.text,
          value,
          span: this.span(key)
        });

        if (!this.match(',')) {
          break;
        }
      }

      this.expect('}');
      return {
        type: 'ObjectExpression',
        properties,
        span: this.span(token)
      };
    }

    if (this.at('/')) {
      this.error('Regular-expression literals are not supported', 'UNSUPPORTED_SYNTAX');
    }

    return this.error('Expected an expression');
  }
  private member(object: Expression): Expression {
    if (this.match('.')) {
      const token = this.current;

      if (token.kind !== 'identifier') {
        this.error('Expected a member name');
      }

      this.take();
      const property: Identifier = {
        type: 'Identifier',
        name: token.text,
        span: token.span
      };
      return {
        type: 'MemberExpression',
        object,
        property,
        computed: false,
        span: this.span(object)
      };
    }

    this.expect('['); const property = this.expression(); this.expect(']');
    return {
      type: 'MemberExpression',
      object,
      property,
      computed: true,
      span: this.span(object)
    };
  }
  private arguments(): Expression[] {
    this.expect('(');
    const args: Expression[] = [];

    if (!this.at(')')) {
      do {
        args.push(this.expression(2));
      } while (this.match(','));
    }

    this.expect(')');
    return args;
  }
  private postfix(expression: Expression): Expression {
    let result = expression;
    let primary = expression;

    while (primary.type === 'ParenthesizedExpression') {
      primary = primary.expression;
    }

    const literal = primary.type === 'ArrayExpression' || (primary.type === 'Literal' && restrictedLiteralKinds.has(primary.kind));

    while (this.at('.') || this.at('[') || this.at('(')) {
      if (literal && result === expression) {
        this.error('Member access on a literal');
      }

      if (this.at('(')) {
        result = {
          type: 'CallExpression',
          callee: result,
          arguments: this.arguments(),
          span: this.span(result)
        };
      } else {
        result = this.member(result);
      }
    }

    const operator = this.current.text;

    if (!this.current.lineBreakBefore && (operator === '++' || operator === '--')) {
      this.take();
      result = {
        type: 'UpdateExpression',
        operator,
        argument: this.assignable(result),
        prefix: false,
        span: this.span(result)
      };
    }

    return result;
  }
}

export function parse(source: string, options: ParseOptions = {}): Program {
  return new SyntaxParser(tokenize(source, options)).program();
}