import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * The core-boundary lint rules are the project's main mechanical guard, and a lint rule that
 * silently stops matching src/core/** fails open: nothing goes red, and core has been importing
 * the DOM for six increments. So the guard is itself guarded — these tests run the repo's real
 * ESLint config over probe sources and assert the violations are actually reported.
 */

const eslint = new ESLint();

async function ruleIdsFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  if (result === undefined) throw new Error(`ESLint returned no result for ${filePath}`);
  return result.messages.map((message) => message.ruleId ?? '(fatal)');
}

const CORE = 'src/core/__probe.ts';
const RENDER = 'src/render/__probe.ts';

describe('src/core/ boundary is enforced by ESLint', () => {
  it('rejects a DOM global', async () => {
    expect(await ruleIdsFor(CORE, 'export const t = document.title;\n')).toContain(
      'no-restricted-globals',
    );
  });

  it('rejects window', async () => {
    expect(await ruleIdsFor(CORE, 'export const w = window.innerWidth;\n')).toContain(
      'no-restricted-globals',
    );
  });

  it('rejects an import from render/', async () => {
    expect(await ruleIdsFor(CORE, "import '../render/scene';\n")).toContain(
      'no-restricted-imports',
    );
  });

  it('rejects an import from app/', async () => {
    expect(await ruleIdsFor(CORE, "import '../app/loop';\n")).toContain('no-restricted-imports');
  });

  it('accepts pure TypeScript', async () => {
    expect(await ruleIdsFor(CORE, 'export const double = (n: number): number => n * 2;\n')).toEqual(
      [],
    );
  });
});

describe('Math.random is banned project-wide', () => {
  it('rejects it in core', async () => {
    expect(await ruleIdsFor(CORE, 'export const r = Math.random();\n')).toContain(
      'no-restricted-properties',
    );
  });

  it('rejects it in render', async () => {
    expect(await ruleIdsFor(RENDER, 'export const r = Math.random();\n')).toContain(
      'no-restricted-properties',
    );
  });
});

describe('the boundary is scoped to core, not applied everywhere', () => {
  it('allows DOM globals outside core', async () => {
    expect(await ruleIdsFor(RENDER, 'export const t = document.title;\n')).not.toContain(
      'no-restricted-globals',
    );
  });
});

describe('the core test suite runs headlessly', () => {
  it('has no document or window in scope', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});
