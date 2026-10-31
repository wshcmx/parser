import { ParserSyntaxError, type ParseOptions, type Position, type SourceSpan } from './diagnostics.ts';

export type TokenKind = 'identifier' | 'integer' | 'real' | 'string' | 'punctuator' | 'eof';

export interface Token {
  kind: TokenKind;
  text: string;
  value?: string;
  span: SourceSpan;
  line: number;
  lineBreakBefore: boolean;
}

const RESERVED_CHARACTERS = {
  CARRIAGE_RETURN: '\r',
  LINE_FEED: '\n',
  TAB: '\t',
  SPACE: ' ',
  BYTE_ORDER_MARK: '\uFEFF',
  FORM_FEED: '\f',
  VERTICAL_TAB: '\v',
  SLASH: '/',
  ASTERISK: '*',
  DECIMAL_POINT: '.',
  SINGLE_QUOTE: "'",
  DOUBLE_QUOTE: '"',
  BACKSLASH: '\\',
  LOWERCASE_EXPONENT: 'e',
  UPPERCASE_EXPONENT: 'E',
  UNICODE_ESCAPE: 'u'
} as const;
const whitespace: ReadonlySet<string> = new Set([
  RESERVED_CHARACTERS.SPACE,
  RESERVED_CHARACTERS.TAB,
  RESERVED_CHARACTERS.CARRIAGE_RETURN,
  RESERVED_CHARACTERS.BYTE_ORDER_MARK,
  RESERVED_CHARACTERS.FORM_FEED,
  RESERVED_CHARACTERS.VERTICAL_TAB,
]);
const punctuators = [
  '>>>=', '===', '!==', '>>>', '<<=', '>>=', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '&=', '|=', '^=',
  '{', '}', '(', ')', '[', ']', '.', ',', ';', ':', '?', '+', '-', '*', '/', '%',
  '=', '<', '>', '!', '~', '&', '|', '^',
];
const escapes: Readonly<Record<string, string>> = {
  n: RESERVED_CHARACTERS.LINE_FEED,
  r: RESERVED_CHARACTERS.CARRIAGE_RETURN,
  t: RESERVED_CHARACTERS.TAB
};
const identifierStartPattern = /^[A-Za-z_$\u0080-\uFFFF]$/;
const identifierPartPattern = /^[A-Za-z0-9_$\u0080-\uFFFF]$/;
const digitPattern = /^[0-9]$/;
const unicodeEscapePattern = /^[0-9a-fA-F]{4}$/;
const identifierStart = (character: string) => identifierStartPattern.test(character);
const identifierPart = (character: string) => identifierPartPattern.test(character);
const digit = (character: string) => digitPattern.test(character);

export function tokenize(source: string, options: ParseOptions = {}): Token[] {
  const sourceName = options.sourceName ?? '<anonymous>';
  const firstLine = options.firstLine ?? 1;

  if (!Number.isSafeInteger(firstLine) || firstLine < 1) {
    throw new RangeError('firstLine must be a positive safe integer');
  }

  let offset = 0;
  let line = firstLine;
  let column = 1;
  let previousWasCR = false;
  let syntaxLine = firstLine;
  let lineBreakBefore = false;
  const tokens: Token[] = [];
  const position = (): Position => ({
    offset,
    line,
    column
  });
  const peek = (distance = 0) => source[offset + distance] ?? '';
  const advance = () => {
    const character = source.charAt(offset++);

    if (character === RESERVED_CHARACTERS.CARRIAGE_RETURN) {
      line++; column = 1;
    } else if (character === RESERVED_CHARACTERS.LINE_FEED) {
      if (!previousWasCR) {
        line++;
      }

      column = 1;
    } else {
      column++;
    }

    previousWasCR = character === RESERVED_CHARACTERS.CARRIAGE_RETURN;
    return character;
  };

  const span = (start: Position): SourceSpan => ({
    sourceName,
    start,
    end: position()
  });

  const emit = (kind: TokenKind, start: Position, value?: string) => {
    tokens.push({
      kind,
      text: source.slice(start.offset, offset),
      ...(value === undefined ? {} : { value }),
      span: span(start),
      line: syntaxLine,
      lineBreakBefore
    });
    lineBreakBefore = false;
  };

  while (offset < source.length) {
    if (peek() === RESERVED_CHARACTERS.LINE_FEED) {
      syntaxLine++; lineBreakBefore = true; advance(); continue;
    }

    if (whitespace.has(peek())) {
      advance(); continue;
    }

    const start = position();

    if (peek() === RESERVED_CHARACTERS.SLASH && peek(1) === RESERVED_CHARACTERS.SLASH) {
      while (offset < source.length && peek() !== RESERVED_CHARACTERS.LINE_FEED) {
        advance();
      }

      continue;
    }

    if (peek() === RESERVED_CHARACTERS.SLASH && peek(1) === RESERVED_CHARACTERS.ASTERISK) {
      advance(); advance();

      while (offset < source.length && !(peek() === RESERVED_CHARACTERS.ASTERISK && peek(1) === RESERVED_CHARACTERS.SLASH)) {
        if (peek() === RESERVED_CHARACTERS.LINE_FEED) {
          syntaxLine++; lineBreakBefore = true;
        }

        advance();
      }

      if (offset === source.length) {
        throw new ParserSyntaxError('UNTERMINATED_COMMENT', 'Unterminated block comment', span(start));
      }

      advance(); advance();
      continue;
    }

    if (identifierStart(peek())) {
      advance();

      while (identifierPart(peek())) {
        advance();
      }

      emit('identifier', start);
      continue;
    }

    if (digit(peek())) {
      while (digit(peek())) {
        advance();
      }

      if (peek() === RESERVED_CHARACTERS.LOWERCASE_EXPONENT || peek() === RESERVED_CHARACTERS.UPPERCASE_EXPONENT) {
        throw new ParserSyntaxError('INVALID_NUMBER', 'Exponent is not supported', span(start));
      }

      let kind: TokenKind = 'integer';

      if (peek() === RESERVED_CHARACTERS.DECIMAL_POINT && !identifierStart(peek(1))) {
        kind = 'real'; advance();

        while (digit(peek())) {
          advance();
        }
      }

      emit(kind, start);
      continue;
    }

    if (peek() === RESERVED_CHARACTERS.DOUBLE_QUOTE || peek() === RESERVED_CHARACTERS.SINGLE_QUOTE) {
      const quote = advance();
      let value = '';
      let closed = false;

      while (offset < source.length) {
        const character = advance();

        if (character === quote) {
          closed = true; break;
        }

        if (character !== RESERVED_CHARACTERS.BACKSLASH) {
          value += character; continue;
        }

        if (offset === source.length) {
          break;
        }

        const escaped = advance();

        if (escaped === RESERVED_CHARACTERS.CARRIAGE_RETURN || escaped === RESERVED_CHARACTERS.LINE_FEED) {
          if (escaped === RESERVED_CHARACTERS.CARRIAGE_RETURN && peek() === RESERVED_CHARACTERS.LINE_FEED) {
            advance();
          }
        } else if (escaped === RESERVED_CHARACTERS.UNICODE_ESCAPE && unicodeEscapePattern.test(source.slice(offset, offset + 4))) {
          const hex = source.slice(offset, offset + 4);

          for (let index = 0; index < 4; index++) {
            advance();
          }

          value += String.fromCharCode(Number.parseInt(hex, 16));
        } else {
          value += escapes[escaped] ?? escaped;
        }
      }

      if (!closed) {
        throw new ParserSyntaxError('UNTERMINATED_STRING', 'Unterminated string literal', span(start));
      }

      emit('string', start, value);
      continue;
    }

    const punctuator = punctuators.find(candidate => source.startsWith(candidate, offset));

    if (punctuator) {
      for (let remaining = punctuator.length; remaining > 0; remaining--) {
        advance();
      }

      emit('punctuator', start);
      continue;
    }

    advance();
    throw new ParserSyntaxError('UNEXPECTED_CHARACTER', `Unexpected character ${JSON.stringify(source.slice(start.offset, offset))}`, span(start));
  }

  tokens.push({
    kind: 'eof',
    text: '',
    span: span(position()),
    line: syntaxLine,
    lineBreakBefore
  });
  return tokens;
}