import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
test('renderer runtime imports stay inside browser-safe source modules', () => {
  const visited = new Set<string>();
  function visit(url: URL, chain: string[]): void {
    if (visited.has(url.href)) return; visited.add(url.href);
    // In-memory type erasure catches value imports while permitting main-owned type imports.
    const text = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext } }).outputText;
    const source = ts.createSourceFile(fileURLToPath(url), text, ts.ScriptTarget.ESNext, true);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const specifier = node.moduleSpecifier.text, path = [...chain, specifier];
      assert.ok(specifier.startsWith('.'), `Non-browser runtime import: ${path.join(' -> ')}`);
      if (specifier.endsWith('.ts')) visit(new URL(specifier, url), path);
    }
  }
  for (const entry of ['../src/renderer.ts', './media-browser.ts']) visit(new URL(entry, import.meta.url), [entry]);
  assert.doesNotMatch(readFileSync(new URL('../src/renderer.ts', import.meta.url), 'utf8'), /\bprompt\s*\(/, 'Electron does not implement prompt; use an HTML form');
});
