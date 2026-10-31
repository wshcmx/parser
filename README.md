# parser

Реализованный на Node.js парсер скриптов диалекта SPXML

## Разработка

```powershell
pnpm install
npm run lint
npm test
npm run typecheck
npm run build
```

## API

Использование установленного пакета в другом проекте:

```typescript
import { parse, tokenize, ParserSyntaxError, type Program } from 'parser';

const options = { sourceName: 'example.js', firstLine: 1 };
const tokens = tokenize('return 1 + 2 * 3;', options);
const program: Program = parse('return 1 + 2 * 3;', options);

console.log(tokens.map(token => token.kind));
console.log(JSON.stringify(program, null, 2));
```

Использование из этого репозитория после сборки:

```javascript
import { parse } from './dist/index.js';
console.log(parse('var answer = 42; return answer;'));
```
