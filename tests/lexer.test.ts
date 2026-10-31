import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ParserSyntaxError, tokenize } from '../src/index.ts';

void test('preserves decimal spelling and integer/real distinction', () => {
  const tokens = tokenize('var amount = 18446744073709551615; amount += 0.5 + 1.0;');
  assert.deepEqual(tokens.filter(token => token.kind === 'integer' || token.kind === 'real').map(token => [token.kind, token.text]),
    [['integer', '18446744073709551615'], ['real', '0.5'], ['real', '1.0']]);
  assert.equal(tokens.at(-1)?.kind, 'eof');
});

void test('tracks half-open UTF-16 ranges and one-based CRLF positions', () => {
  const tokens = tokenize('// comment\r\n/* block */\r\nreturn "\u0416";', {
    sourceName: 'fixture.js',
    firstLine: 8
  });
  assert.deepEqual(tokens[0]?.span.start, {
    offset: 25,
    line: 10,
    column: 1
  });
  assert.equal(tokens[0].span.sourceName, 'fixture.js');
  const stringToken = tokens[1];
  assert.ok(stringToken);
  assert.equal(stringToken.span.end.offset - stringToken.span.start.offset, 3);
});

void test('decodes strings without executing source', () => {
  assert.equal(tokenize(String.raw`'a\n\x42\u0043\"\\'`)[0]?.value, 'a\nx42C"\\');
  assert.equal(tokenize('"\uD83D\uDE00"')[0]?.span.end.offset, 4);
});

void test('longest punctuators win', () => {
  assert.deepEqual(tokenize('a >>>= 1; b !== c; ++b;').filter(token => token.kind === 'punctuator').map(token => token.text),
    ['>>>=', ';', '!==', ';', '++', ';']);
});

void test('rejects malformed and unsupported literals with structured diagnostics', () => {
  for (const source of ['1e3', '1E3']) {
    assert.throws(() => tokenize(source), (error: unknown) => error instanceof ParserSyntaxError && error.code === 'INVALID_NUMBER');
  }

  for (const [source, code] of [['/*', 'UNTERMINATED_COMMENT'], ['"abc', 'UNTERMINATED_STRING'], ['@', 'UNEXPECTED_CHARACTER']] as const) {
    assert.throws(() => tokenize(source), (error: unknown) => error instanceof ParserSyntaxError && error.code === code);
  }

  assert.throws(() => tokenize('', { firstLine: 0 }), RangeError);
});

void test('names are not given invented keyword categories', () => {
  assert.deepEqual(tokenize('class const let var typeof void this undefined in \u0418\u043C\u044F').slice(0, -1).map(token => token.kind), Array(10).fill('identifier'));
});

void test('numeric boundaries match the reference lexer', () => {
  assert.deepEqual(tokenize('0xff .5 2foo 1.name 0. 1.0e3').slice(0, -1).map(token => [token.kind, token.text]), [
    ['integer', '0'], ['identifier', 'xff'], ['punctuator', '.'], ['integer', '5'],
    ['integer', '2'], ['identifier', 'foo'], ['integer', '1'], ['punctuator', '.'], ['identifier', 'name'],
    ['real', '0.'], ['real', '1.0'], ['identifier', 'e3'],
  ]);
});

void test('legacy escapes and multiline string syntax preserve dialect line tracking', () => {
  assert.equal(tokenize(String.raw`'\b\f\v\0\123\uQQQQ'`)[0]?.value, 'bfv0123uQQQQ');
  const tokens = tokenize('"first\nsecond"\nnext');
  assert.equal(tokens[0]?.value, 'first\nsecond');
  assert.equal(tokens[1]?.line, 2);
  assert.equal(tokens[1].span.start.line, 3);
  assert.equal(tokens[1].lineBreakBefore, true);
  const continued = tokenize('"first\\\r\nsecond" next');
  assert.equal(continued[0]?.value, 'firstsecond');
  assert.equal(continued[1]?.line, 1);
  assert.equal(continued[1].lineBreakBefore, false);
});