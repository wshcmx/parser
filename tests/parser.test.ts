import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse, ParserSyntaxError, type Expression, type Program } from '../src/index.ts';

const parsers: {
  name: string;
  parseSource: typeof parse;
}[] = [
  {
    name: 'parse',
    parseSource: parse
  },
];

const astCases: {
  name: string;
  source: string;
  expected: unknown;
}[] = [
  {
    name: 'empty program',
    source: '',
    expected: {
      type: 'Program',
      body: []
    }
  },
  {
    name: 'integer precision',
    source: 'return 9007199254740993;',
    expected: {
      type: 'Program',
      body: [{
        type: 'ReturnStatement',
        argument: {
          type: 'Literal',
          kind: 'integer',
          raw: '9007199254740993',
          value: '9007199254740993'
        }
      }]
    }
  },
  {
    name: 'undefined omits its value',
    source: 'return undefined;',
    expected: {
      type: 'Program',
      body: [{
        type: 'ReturnStatement',
        argument: {
          type: 'Literal',
          kind: 'undefined',
          raw: 'undefined'
        }
      }]
    }
  },
  {
    name: 'arithmetic precedence',
    source: 'return 1 + 2 * 3;',
    expected: {
      type: 'Program',
      body: [{
        type: 'ReturnStatement',
        argument: {
          type: 'BinaryExpression',
          operator: '+',
          left: {
            type: 'Literal',
            kind: 'integer',
            raw: '1',
            value: '1'
          },
          right: {
            type: 'BinaryExpression',
            operator: '*',
            left: {
              type: 'Literal',
              kind: 'integer',
              raw: '2',
              value: '2'
            },
            right: {
              type: 'Literal',
              kind: 'integer',
              raw: '3',
              value: '3'
            }
          }
        }
      }]
    }
  },
  {
    name: 'variable declaration and identifier',
    source: 'var answer = 42; return answer;',
    expected: {
      type: 'Program',
      body: [{
        type: 'VariableDeclaration',
        declarations: [{
          type: 'VariableDeclarator',
          id: {
            type: 'Identifier',
            name: 'answer'
          },
          init: {
            type: 'Literal',
            kind: 'integer',
            raw: '42',
            value: '42'
          }
        }]
      }, {
        type: 'ReturnStatement',
        argument: {
          type: 'Identifier',
          name: 'answer'
        }
      }]
    }
  },
  {
    name: 'indexed member call',
    source: 'return items[0].get(2);',
    expected: {
      type: 'Program',
      body: [{
        type: 'ReturnStatement',
        argument: {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'MemberExpression',
              object: {
                type: 'Identifier',
                name: 'items'
              },
              property: {
                type: 'Literal',
                kind: 'integer',
                raw: '0',
                value: '0'
              },
              computed: true
            },
            property: {
              type: 'Identifier',
              name: 'get'
            },
            computed: false
          },
          arguments: [{
            type: 'Literal',
            kind: 'integer',
            raw: '2',
            value: '2'
          }]
        }
      }]
    }
  },
  {
    name: 'function declaration',
    source: 'function echo(value) { return value; }',
    expected: {
      type: 'Program',
      body: [{
        type: 'FunctionDeclaration',
        id: {
          type: 'Identifier',
          name: 'echo'
        },
        params: [{
          type: 'Identifier',
          name: 'value'
        }],
        body: {
          type: 'BlockStatement',
          body: [{
            type: 'ReturnStatement',
            argument: {
              type: 'Identifier',
              name: 'value'
            }
          }]
        }
      }]
    }
  },
];

function withoutSpans(program: Program): unknown {
  return JSON.parse(JSON.stringify(program, (key, value: unknown) => key === 'span' ? undefined : value));
}

for (const { name, parseSource } of parsers) {
  for (const fixture of astCases) {
    void test(`${name} AST contract: ${fixture.name}`, () => {
      const program = parseSource(fixture.source);
      assert.deepEqual(withoutSpans(program), fixture.expected);
      assert.deepEqual(JSON.parse(JSON.stringify(program)), program);
    });
  }

  void test(`${name} for-in accepts an optional var without changing classic for loops`, () => {
    const source = 'for (var item in items) { total += item; }';
    const program = parseSource(source);
    assert.deepEqual(withoutSpans(program), withoutSpans(parseSource('for (item in items) { total += item; }')));
    const loop = program.body[0];
    assert.equal(loop?.type, 'ForInStatement');

    assert.equal(loop.left.name, 'item');
    assert.equal(loop.left.span.start.offset, source.indexOf('item'));
    assert.equal(loop.span.start.offset, 0);
    assert.equal(loop.span.end.offset, source.length);
    assert.equal(parseSource('for (var index = 0; index < 3; index++) {}').body[0]?.type, 'ForStatement');
    assert.throws(() => parseSource('for (var item = 1 in items) {}'), ParserSyntaxError);
    assert.throws(() => parseSource('for (var item, other in items) {}'), ParserSyntaxError);
  });

  void test(`${name} AST contract: source spans with CRLF and firstLine`, () => {
    const source = 'return name;\r\nreturn 2;';
    const program = parseSource(source, {
      sourceName: 'fixture.js',
      firstLine: 10
    });
    assert.deepEqual(program.span, {
      sourceName: 'fixture.js',
      start: {
        offset: 0,
        line: 10,
        column: 1
      },
      end: {
        offset: 23,
        line: 11,
        column: 10
      }
    });
    const first = program.body[0];
    assert.ok(first);
    assert.equal(first.type, 'ReturnStatement');
    assert.ok(first.argument);
    assert.deepEqual(first.argument.span, {
      sourceName: 'fixture.js',
      start: {
        offset: 7,
        line: 10,
        column: 8
      },
      end: {
        offset: 11,
        line: 10,
        column: 12
      }
    });
    const second = program.body[1];
    assert.ok(second);
    assert.equal(source.slice(second.span.start.offset, second.span.end.offset), 'return 2;');
    assert.deepEqual(second.span.start, {
      offset: 14,
      line: 11,
      column: 1
    });
  });

  void test(`${name} AST contract: structured syntax errors`, () => {
    assert.throws(() => parseSource('return (1;', {
      sourceName: 'broken.js',
      firstLine: 5
    }), (error: unknown) => {
      assert.ok(error instanceof ParserSyntaxError);
      assert.equal(error.code, 'UNEXPECTED_TOKEN');
      assert.deepEqual(error.span, {
        sourceName: 'broken.js',
        start: {
          offset: 9,
          line: 5,
          column: 10
        },
        end: {
          offset: 10,
          line: 5,
          column: 11
        }
      });
      return true;
    });
  });
}

function returned(source: string): Expression {
  const statement = parse(`return ${source};`).body[0];
  assert.ok(statement);
  assert.equal(statement.type, 'ReturnStatement');
  assert.ok(statement.argument, 'Expected return argument');
  return statement.argument;
}

void test('returns serializable, located ASTs without losing integer precision', () => {
  const source = 'var total = 18446744073709551615; return total;';
  const program = parse(source, { sourceName: 'sample.js' });
  assert.equal(program.type, 'Program');
  assert.equal(program.span.end.offset, source.length);
  assert.equal(program.body[0]?.type, 'VariableDeclaration');
  assert.match(JSON.stringify(program), /18446744073709551615/);
  assert.equal(parse('').body.length, 0);
});

void test('preserves arithmetic precedence and right-associative assignments', () => {
  const expression = returned('left = right = 1 + 2 * 3');
  assert.equal(expression.type, 'AssignmentExpression');
  assert.equal(expression.right.type, 'AssignmentExpression');
  const addition = expression.right.right;
  assert.equal(addition.type, 'BinaryExpression');
  assert.equal(addition.operator, '+');
  assert.equal(addition.right.type, 'BinaryExpression');
  assert.equal(addition.right.operator, '*');
});

void test('ternary alternate captures comma expressions as specified by the dialect', () => {
  const expression = returned('false ? 1 : 2, 3');
  assert.equal(expression.type, 'ConditionalExpression');
  assert.equal(expression.alternate.type, 'SequenceExpression');
  assert.equal(returned('(false ? 1 : 2), 3').type, 'SequenceExpression');
});

void test('retains duplicate object properties and parenthesis spans without inventing array holes', () => {
  const expression = returned('[{name: 1, name: 2, "default": 3}, (4),]');
  assert.equal(expression.type, 'ArrayExpression');
  const object = expression.elements[0];
  assert.equal(object?.type, 'ObjectExpression');
  assert.deepEqual(object.properties.map(property => property.key), ['name', 'name', 'default']);
  assert.equal(expression.elements[1]?.type, 'ParenthesizedExpression');
  assert.throws(() => returned('[,1]'), ParserSyntaxError);
});

void test('supports calls, constructor/member chains, assignments, and updates', () => {
  for (const source of ['new Container(1).items[0].get(2)', 'new Namespace.Item()', 'new Item', 'item.value += 1', '++index', 'items[0]--', 'left instanceof Object']) {
    assert.doesNotThrow(() => returned(source));
  }

  assert.throws(() => returned('(1 + 2) = 3'), { code: 'INVALID_ASSIGNMENT' });
  assert.throws(() => returned('++1'), { code: 'INVALID_ASSIGNMENT' });
});

void test('parses functions, all basic loop forms, conditionals, and top-level returns', () => {
  const source = `
    function sum(items) {
      var total = 0, count;
      for (item in items) { total += item; }
      for (index = 0; index < 3; index++) { if (index == 1) continue; else total++; }
      while (total < 10) { total++; if (total == 8) break; }
      do { total--; } while (total > 5);
      for (;;) { break; }
      return total;
    }
    return sum([1, 2]);
  `;
  assert.deepEqual(parse(source).body.map(statement => statement.type), ['FunctionDeclaration', 'ReturnStatement']);
  assert.equal(parse('for (item in items) item.value++;').body[0]?.type, 'ForInStatement');
});

void test('parses switch fallthrough, try/catch/finally, throw, and with', () => {
  const source = 'switch (value) { case 1: case 2: break; default: with (object) { value = name; } } try { throw "bad"; } catch (error) { return error; } finally {}';
  assert.deepEqual(parse(source).body.map(statement => statement.type), ['SwitchStatement', 'TryStatement']);
  assert.throws(() => parse('try {} finally {}'), ParserSyntaxError);
  assert.throws(() => parse('try {}'), ParserSyntaxError);
  assert.throws(() => parse('switch (x) { default: default: }'), ParserSyntaxError);
});

void test('semicolons are optional even on the same line and return stops at a dialect newline', () => {
  assert.equal(parse('var x = 1\nvar y = 2\nreturn x + y').body.length, 3);
  const returnedLine = parse('return\n1;').body;
  assert.equal(returnedLine.length, 2);
  assert.equal(returnedLine[0]?.type === 'ReturnStatement' ? returnedLine[0].argument : undefined, null);
  assert.equal(parse('1 2').body.length, 2);
  assert.equal(parse('var x = 1 var y = 2 return x').body.length, 3);
  assert.throws(() => parse('var x = ;'), ParserSyntaxError);
  assert.throws(() => parse('function f( {'), ParserSyntaxError);
  assert.throws(() => parse('{'), ParserSyntaxError);
});

void test('leaves break/continue context to runtime but rejects non-name for-in bindings and labels', () => {
  for (const source of ['break;', 'continue;', 'while (true) { function bad() { break; } }']) {
    assert.doesNotThrow(() => parse(source));
  }

  for (const source of ['for (var x = 1 in items) {}', 'for (var x, y in items) {}', 'for (x.value in items) {}']) {
    assert.throws(() => parse(source), ParserSyntaxError);
  }

  assert.throws(() => parse('outer: while (true) break outer;'), { code: 'UNSUPPORTED_SYNTAX' });
});

void test('unary syntax and signed multiplicative parsing match the existing implementation', () => {
  for (const source of ['typeof(value)', 'delete value.name', 'void value']) {
    assert.equal(returned(source).type, 'UnaryExpression');
  }

  for (const operator of ['*', '/', '%']) {
    const expression = returned(`left ${operator} -right`);
    assert.equal(expression.type === 'BinaryExpression' ? expression.operator : undefined, '-');
    assert.equal(expression.type === 'BinaryExpression' ? expression.right.type : undefined, 'UnaryExpression');
  }

  for (const source of ['function () {}', '/pattern/']) {
    assert.throws(() => returned(source), { code: 'UNSUPPORTED_SYNTAX' });
  }

  assert.throws(() => returned('+value'), ParserSyntaxError);
  assert.doesNotThrow(() => returned('left * (-right)'));
});

void test('diagnostics carry source name and supplied starting line', () => {
  assert.throws(() => parse('var answer = ;', {
    sourceName: 'forms/example.xmd',
    firstLine: 20
  }),
  (error: unknown) => error instanceof ParserSyntaxError && error.span.sourceName === 'forms/example.xmd'
      && error.span.start.line === 20 && error.span.start.column === 14);
});

void test('class, const, let, and in are names, while this is a dedicated expression', () => {
  assert.doesNotThrow(() => parse('var class = 1 var const = 2 var let = 3 var in = 4 return class + const + let + in'));
  assert.equal(returned('this').type, 'ThisExpression');
  assert.throws(() => parse('var this = 1'), ParserSyntaxError);
});

void test('initialized declarations consume comma expressions rather than inventing extra declarations', () => {
  const statement = parse('var first = 1, second = 2;').body[0];
  assert.ok(statement);
  assert.equal(statement.type, 'VariableDeclaration');
  assert.equal(statement.declarations.length, 1);
  assert.equal(statement.declarations[0]?.init?.type, 'SequenceExpression');
  const uninitialized = parse('var first, second = 2;').body[0];
  assert.ok(uninitialized);
  assert.equal(uninitialized.type === 'VariableDeclaration' ? uninitialized.declarations.length : 0, 2);
});

void test('literal member access, constructor targets, and duplicate constant cases follow the reference', () => {
  for (const source of ['"abc".length', '[1,2].join(",")', '(1).value', 'new this()']) {
    assert.throws(() => returned(source), ParserSyntaxError);
  }

  const indexed = returned('new Items[0]()');
  assert.equal(indexed.type, 'CallExpression');

  if (indexed.callee.type === 'MemberExpression') {
    assert.equal(indexed.callee.object.type, 'NewExpression');
  }

  assert.throws(() => parse('switch (x) { case 1: break; case 1.0: break; }'), ParserSyntaxError);
  assert.throws(() => parse('switch (x) { case "same": break; case "same": break; }'), ParserSyntaxError);
  assert.doesNotThrow(() => parse('switch (x) { case 1: break; case "1": break; }'));
});