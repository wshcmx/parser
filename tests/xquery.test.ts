import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseXQuery, XQuerySyntaxError } from '../src/index.ts';

void test('XQuery preserves catalogs, integer precision, null and logical precedence', () => {
  assert.deepEqual(parseXQuery('common.lesson_states'), {
    kind: 'catalog',
    table: 'common.lesson_states'
  });
  const query = parseXQuery('for $e in collaborators where $e/id = 9007199254740993 and $e/active = false() or $e/name = null() return $e');
  assert.equal(query.kind, 'flwor');
  assert.deepEqual(query.binds, [{
    v: 'e',
    table: 'collaborators'
  }]);
  assert.deepEqual(query.where, {
    k: 'or',
    l: {
      k: 'and',
      l: {
        k: 'cmp',
        op: '=',
        l: {
          k: 'path',
          v: 'e',
          field: 'id'
        },
        r: {
          k: 'lit',
          kind: 'int',
          v: 9007199254740993n
        }
      },
      r: {
        k: 'cmp',
        op: '=',
        l: {
          k: 'path',
          v: 'e',
          field: 'active'
        },
        r: {
          k: 'lit',
          kind: 'bool',
          v: false
        }
      }
    },
    r: {
      k: 'cmp',
      op: '=',
      l: {
        k: 'path',
        v: 'e',
        field: 'name'
      },
      r: {
        k: 'lit',
        kind: 'null',
        v: null
      }
    }
  });
});

void test('XQuery parses reference functions, sequences, foreign fields and projections', () => {
  const query = parseXQuery("for $e in collaborators where MatchSome($e/id, (1, 0xffffffffffffffff)) and contains(ForeignElem($e/position_id)/name, 'O''Brien') order by $e/name descending return distinct $e/Fields('id','name')");
  assert.equal(query.kind, 'flwor');
  assert.equal(query.distinct, true);
  assert.deepEqual(query.ret, {
    v: 'e',
    fields: ['id', 'name']
  });
  assert.deepEqual(query.order, [{
    e: {
      k: 'path',
      v: 'e',
      field: 'name'
    },
    desc: true
  }]);
  assert.equal(query.where?.k, 'and');

  assert.deepEqual(query.where.l, {
    k: 'bool',
    e: {
      k: 'func',
      name: 'matchsome',
      args: [{
        k: 'path',
        v: 'e',
        field: 'id'
      }, {
        k: 'seq',
        items: [{
          k: 'lit',
          kind: 'int',
          v: 1n
        }, {
          k: 'lit',
          kind: 'int',
          v: -1n
        }]
      }]
    }
  });
});

void test('XQuery preserves reference hierarchy and quantified condition grammar', () => {
  const query = parseXQuery('for $e in collaborators where some $p in positions satisfies $p/id = $e/position_id order by $e/Hier() return ($e)');
  assert.equal(query.kind, 'flwor');
  assert.equal(query.where?.k, 'some');
  assert.deepEqual(query.ret, {
    v: 'e',
    hier: true
  });
  assert.deepEqual(query.order, [{
    e: {
      k: 'hier',
      v: 'e',
      args: []
    },
    desc: false
  }]);
  assert.equal(parseXQuery("CatalogHierSubset('collaborators', 123)").kind, 'hierarchy');
});

void test('XQuery rejects malformed syntax with its own diagnostics', () => {
  for (const source of ['', 'for $e in return $e', "for $e in collaborators where $e/name = 'bad return $e", 'for $e in collaborators return $e unexpected', 'for $e in collaborators where ForeignElem(1)/id = 1 return $e']) {
    assert.throws(() => parseXQuery(source), XQuerySyntaxError);
  }
});