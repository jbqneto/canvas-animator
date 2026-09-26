/**
 * Lists user-visible texts that are not going through the i18n dictionaries.
 * Usage: node scripts/i18n-scan.mjs [files...]   (defaults to every .ts/.tsx file under src)
 * Heuristic: JSX text and string literals that look like words for humans (letters + space or accents),
 * skipping technical attributes (className, key, value…), imports, object keys, comparisons and the
 * dictionaries themselves. Exits with code 1 when something is found, so it can gate CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = ['src/i18n', '__tests__', 'vite-env'];
const TECH_ATTRS = new Set(['className', 'key', 'value', 'type', 'href', 'src', 'id', 'accept', 'rel', 'viewBox', 'd', 'fill', 'stroke', 'role', 'style']);
// Calls whose string arguments are never shown to users
const TECH_CALLS = new Set(['log', 'warn', 'error', 'fetch', 'addEventListener', 'removeEventListener', 'getContext', 'toDataURL', 'querySelector', 'localeCompare', 'toLocaleString', 'toLocaleLowerCase', 'createElement', 'setAttribute', 'getItem', 'setItem', 'removeItem', 't', 'translate', 'matchMedia', 'isTypeSupported', 'toFixed', 'createObjectStore', 'open', 'transaction', 'put', 'get', 'delete', 'import', 'setLineDash', 'measureText', 'includes', 'startsWith', 'endsWith', 'replace', 'split', 'join']);
const ALLOW = [/^FlashMotion/, /^Flash \+ Remotion$/, /^[\d.,:%×x ()+-]+$/, /^F\d/, /^[A-Z0-9 _:.+\-×/()%]+$/, /^(Ctrl|Shift|Alt)\b/, /^https?:/, /^data:/, /^(video|image|application)\//, /monospace|sans-serif/, /^rgba?\(/, /^#[0-9a-f]{3,8}$/i, /^gemini-/, /^\d\.\d (Flash|Pro)/, /^Studio$/, /^s ·$/, /^[\s◆➔→FP0-9]+$/];

const files = process.argv.slice(2).length ? process.argv.slice(2) : walk(path.join(ROOT, 'src'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (SKIP.some((s) => p.includes(s))) return [];
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : [];
  });
}

function looksHuman(raw) {
  const text = raw.trim();
  if (text.length < 2 || !/[A-Za-zÀ-ú]/.test(text)) return false;
  if (ALLOW.some((re) => re.test(text))) return false;
  const accented = /[À-ú]/.test(text);
  if (!/\s/.test(text) && !accented) {
    // single word: only capitalized words are likely labels ("Salvar"); ids/keys/classes are not
    return /^[A-ZÀ-Ú][a-zà-ú]{3,}[.:!?…]?$/.test(text);
  }
  // tailwind-ish class lists
  if (!accented && /^[\w:/[\].%#-]+(\s+[\w:/[\].%#-]+)+$/.test(text) && /-/.test(text)) return false;
  return true;
}

const calleeName = (callee) =>
  callee?.type === 'Identifier' ? callee.name : callee?.type === 'MemberExpression' ? callee.property?.name : '';

let count = 0;
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true });
  } catch (err) {
    console.error(`${file}: parse error ${err.message}`);
    continue;
  }
  const report = (node, text) => {
    console.log(`${path.relative(ROOT, file)}:${node.loc.start.line}: ${text.trim().replace(/\s+/g, ' ').slice(0, 110)}`);
    count++;
  };
  const visit = (node, parent, key) => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
      case 'TSTypeAnnotation':
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
      case 'TSLiteralType':
        return;
      case 'JSXAttribute':
        if (TECH_ATTRS.has(node.name?.name)) return;
        break;
      case 'CallExpression':
      case 'NewExpression':
        if (TECH_CALLS.has(calleeName(node.callee))) return;
        break;
      case 'JSXText':
        if (looksHuman(node.value)) report(node, node.value);
        break;
      case 'StringLiteral': {
        const isKey = parent?.type === 'ObjectProperty' && key === 'key';
        const isCompare = parent?.type === 'BinaryExpression' && /[=!]==?/.test(parent.operator);
        const isCase = parent?.type === 'SwitchCase';
        const isIndex = parent?.type === 'MemberExpression' && parent.computed;
        const isDirective = parent?.type === 'Directive';
        if (!isKey && !isCompare && !isCase && !isIndex && !isDirective && looksHuman(node.value)) report(node, node.value);
        break;
      }
      case 'TemplateLiteral': {
        const raw = node.quasis.map((q) => q.value.cooked).join('…');
        if (looksHuman(raw)) report(node, raw);
        node.expressions.forEach((e) => visit(e, node, 'expressions'));
        return;
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments') continue;
      if (Array.isArray(v)) v.forEach((c) => visit(c, node, k));
      else if (v && typeof v === 'object') visit(v, node, k);
    }
  };
  visit(ast.program, null, null);
}
console.log(`\n${count} possible untranslated text(s)`);
process.exitCode = count > 0 ? 1 : 0;
