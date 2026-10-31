import type { SourceSpan } from './diagnostics.ts';

export interface Node {
  span: SourceSpan;
}
export interface Program extends Node {
  type: 'Program';
  body: Statement[];
}
export interface Identifier extends Node {
  type: 'Identifier';
  name: string;
}
export interface ThisExpression extends Node {
  type: 'ThisExpression';
}
export interface Literal extends Node {
  type: 'Literal';
  kind: 'integer' | 'real' | 'string' | 'boolean' | 'null' | 'undefined';
  raw: string;
  value?: string | boolean | null;
}
export interface ArrayExpression extends Node {
  type: 'ArrayExpression';
  elements: Expression[];
}
export interface Property extends Node {
  type: 'Property';
  key: string;
  value: Expression;
}
export interface ObjectExpression extends Node {
  type: 'ObjectExpression';
  properties: Property[];
}
export interface UnaryExpression extends Node {
  type: 'UnaryExpression';
  operator: string;
  argument: Expression;
}
export interface UpdateExpression extends Node {
  type: 'UpdateExpression';
  operator: '++' | '--';
  argument: Assignable;
  prefix: boolean;
}
export interface BinaryExpression extends Node {
  type: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
}
export interface AssignmentExpression extends Node {
  type: 'AssignmentExpression';
  operator: string;
  left: Assignable;
  right: Expression;
}
export interface ConditionalExpression extends Node {
  type: 'ConditionalExpression';
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}
export interface SequenceExpression extends Node {
  type: 'SequenceExpression';
  expressions: Expression[];
}
export interface MemberExpression extends Node {
  type: 'MemberExpression';
  object: Expression;
  property: Expression;
  computed: boolean;
}
export interface CallExpression extends Node {
  type: 'CallExpression';
  callee: Expression;
  arguments: Expression[];
}
export interface NewExpression extends Node {
  type: 'NewExpression';
  callee: Expression;
  arguments: Expression[];
}
export interface ParenthesizedExpression extends Node {
  type: 'ParenthesizedExpression';
  expression: Expression;
}
export type Assignable = Identifier | MemberExpression | ParenthesizedExpression;
export type Expression = Identifier | ThisExpression | Literal | ArrayExpression | ObjectExpression | UnaryExpression | UpdateExpression
  | BinaryExpression | AssignmentExpression | ConditionalExpression | SequenceExpression | MemberExpression
  | CallExpression | NewExpression | ParenthesizedExpression;

export interface BlockStatement extends Node {
  type: 'BlockStatement';
  body: Statement[];
}
export interface EmptyStatement extends Node {
  type: 'EmptyStatement';
}
export interface ExpressionStatement extends Node {
  type: 'ExpressionStatement';
  expression: Expression;
}
export interface VariableDeclarator extends Node {
  type: 'VariableDeclarator';
  id: Identifier;
  init: Expression | null;
}
export interface VariableDeclaration extends Node {
  type: 'VariableDeclaration';
  declarations: VariableDeclarator[];
}
export interface FunctionDeclaration extends Node {
  type: 'FunctionDeclaration';
  id: Identifier;
  params: Identifier[];
  body: BlockStatement;
}
export interface ReturnStatement extends Node {
  type: 'ReturnStatement';
  argument: Expression | null;
}
export interface ThrowStatement extends Node {
  type: 'ThrowStatement';
  argument: Expression;
}
export interface IfStatement extends Node {
  type: 'IfStatement';
  test: Expression;
  consequent: Statement;
  alternate: Statement | null;
}
export interface WhileStatement extends Node {
  type: 'WhileStatement';
  test: Expression;
  body: Statement;
}
export interface DoWhileStatement extends Node {
  type: 'DoWhileStatement';
  body: Statement;
  test: Expression;
}
export interface ForStatement extends Node {
  type: 'ForStatement';
  init: VariableDeclaration | Expression | null;
  test: Expression | null;
  update: Expression | null;
  body: Statement;
}
export interface ForInStatement extends Node {
  type: 'ForInStatement';
  left: Identifier;
  right: Expression;
  body: Statement;
}
export interface BreakStatement extends Node {
  type: 'BreakStatement';
}
export interface ContinueStatement extends Node {
  type: 'ContinueStatement';
}
export interface SwitchCase extends Node {
  type: 'SwitchCase';
  test: Expression | null;
  consequent: Statement[];
}
export interface SwitchStatement extends Node {
  type: 'SwitchStatement';
  discriminant: Expression;
  cases: SwitchCase[];
}
export interface CatchClause extends Node {
  type: 'CatchClause';
  param: Identifier;
  body: BlockStatement;
}
export interface TryStatement extends Node {
  type: 'TryStatement';
  block: BlockStatement;
  handler: CatchClause;
  finalizer: BlockStatement | null;
}
export interface WithStatement extends Node {
  type: 'WithStatement';
  object: Expression;
  body: Statement;
}
export type Statement = BlockStatement | EmptyStatement | ExpressionStatement | VariableDeclaration | FunctionDeclaration
  | ReturnStatement | ThrowStatement | IfStatement | WhileStatement | DoWhileStatement | ForStatement | ForInStatement
  | BreakStatement | ContinueStatement | SwitchStatement | TryStatement | WithStatement;