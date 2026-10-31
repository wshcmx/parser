export interface Position {
  offset: number;
  line: number;
  column: number;
}

export interface SourceSpan {
  sourceName: string;
  start: Position;
  end: Position;
}

export interface ParseOptions {
  sourceName?: string;
  firstLine?: number;
}

export type DiagnosticCode = 'UNEXPECTED_CHARACTER' | 'UNTERMINATED_COMMENT' | 'UNTERMINATED_STRING'
  | 'INVALID_NUMBER' | 'UNEXPECTED_TOKEN' | 'INVALID_ASSIGNMENT' | 'UNSUPPORTED_SYNTAX';

export class ParserSyntaxError extends SyntaxError {
  readonly code: DiagnosticCode;
  readonly span: SourceSpan;

  constructor(code: DiagnosticCode, message: string, span: SourceSpan) {
    super(`${message} (${span.sourceName}:${String(span.start.line)}:${String(span.start.column)})`);
    this.name = 'ParserSyntaxError';
    this.code = code;
    this.span = span;
  }
}