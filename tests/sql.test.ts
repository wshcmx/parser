import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupSqlTokens, splitSqlStatements, SqlSyntaxError, tokenizeSql, type SqlNode } from '../src/index.ts';

void test('SQL tokens preserve spelling, offsets, escaped literals and quoted names', () => {
  const tokens = tokenizeSql("-- comment\nSELECT [A]]B], N'O''Brien', 9007199254740993, @Value /* hint */");
  assert.deepEqual(tokens.map(({ k, v }) => ({
    k,
    v
  })), [
    {
      k: 'word',
      v: 'SELECT'
    }, {
      k: 'qid',
      v: 'A]B'
    }, {
      k: 'op',
      v: ','
    }, {
      k: 'str',
      v: "O'Brien"
    },
    {
      k: 'op',
      v: ','
    }, {
      k: 'num',
      v: '9007199254740993'
    }, {
      k: 'op',
      v: ','
    }, {
      k: 'var',
      v: '@value'
    }
  ]);
  assert.equal(tokens[0]?.at, 11);
  assert.equal(tokenizeSql('1.25e-2')[0]?.v, '1.25e-2');
});

void test('SQL grouping preserves nested calls and rejects unbalanced delimiters', () => {
  const nodes = groupSqlTokens(tokenizeSql('ISNULL((id),0)'));
  assert.equal(nodes[1]?.k, 'group');

  for (const source of ["SELECT 'bad", 'SELECT [bad', 'SELECT (1', 'SELECT 1)']) {
    assert.throws(() => groupSqlTokens(tokenizeSql(source)), SqlSyntaxError);
  }
});

void test('SQL statement boundaries retain CTEs, unions, subqueries and INSERT SELECT', () => {
  const parse = (source: string): SqlNode[][] => splitSqlStatements(groupSqlTokens(tokenizeSql(source)));
  assert.equal(parse('SELECT 1 AS ID SELECT 2 AS ID; SELECT 3 AS ID').length, 3);
  assert.equal(parse('SELECT (SELECT 1) AS ID UNION ALL SELECT 2 AS ID').length, 1);
  assert.equal(parse('WITH source AS (SELECT 1 AS ID) SELECT ID FROM source SELECT 2 AS ID').length, 2);
  assert.equal(parse('INSERT INTO items SELECT ID FROM source UNION SELECT ID FROM other SELECT 2 AS ID').length, 2);
  assert.equal(parse('CREATE TABLE items (id int PRIMARY KEY) INSERT INTO items VALUES (1) UPDATE items SET id = 2 DELETE FROM items').length, 4);
});