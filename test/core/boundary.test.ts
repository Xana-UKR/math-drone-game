import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * The core-boundary lint rules are the project's main mechanical guard, and a lint rule that
 * silently stops matching src/core/** fails open: nothing goes red, and core has been importing
 * the DOM for six increments. So the guard is itself guarded — these tests run the repo's real
 * ESLint config over probe sources and assert the violations are actually reported.
 */

const eslint = new ESLint();

const CORE = 'src/core/__probe.ts';
const RENDER = 'src/render/__probe.ts';

async function ruleIdsFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  if (result === undefined) throw new Error(`ESLint returned no result for ${filePath}`);
  return result.messages.map((message) => message.ruleId ?? '(fatal)');
}

/**
 * Read the banned list out of the *effective* config rather than restating it here, so adding a
 * global to eslint.config.js automatically puts it under test — and so a config that stops
 * applying to CORE at all (a renamed folder, a changed vitest cwd) fails by name.
 */
async function bannedGlobalsInCore(): Promise<string[]> {
  const config: unknown = await eslint.calculateConfigForFile(CORE);
  const rules = (config as { rules?: Record<string, unknown> }).rules;
  const entry = rules?.['no-restricted-globals'];
  if (!Array.isArray(entry)) {
    throw new Error(
      `no-restricted-globals is not configured for ${CORE} — the src/core/** override does not ` +
        'match this path, so none of the boundary assertions below mean anything.',
    );
  }
  const [, ...banned] = entry as unknown[];
  return banned.map((item) => (typeof item === 'string' ? item : (item as { name: string }).name));
}

describe('src/core/ boundary is enforced by ESLint', () => {
  it('rejects every global on the banned list', async () => {
    const names = await bannedGlobalsInCore();
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      const ruleIds = await ruleIdsFor(CORE, `export const probe = ${name};\n`);
      expect(ruleIds, `${name} is on the banned list but was not rejected`).toContain(
        'no-restricted-globals',
      );
    }
  });

  it('rejects an import from render/', async () => {
    expect(await ruleIdsFor(CORE, "import '../render/scene';\n")).toContain(
      'no-restricted-imports',
    );
  });

  it('rejects an import from app/', async () => {
    expect(await ruleIdsFor(CORE, "import '../app/loop';\n")).toContain('no-restricted-imports');
  });

  it('rejects a dynamic import from render/', async () => {
    expect(
      await ruleIdsFor(CORE, "export const load = () => import('../render/scene');\n"),
    ).toContain('no-restricted-syntax');
  });

  it('rejects a dynamic import from app/', async () => {
    expect(await ruleIdsFor(CORE, "export const load = () => import('../app/loop');\n")).toContain(
      'no-restricted-syntax',
    );
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

describe('core cannot opt out of the boundary', () => {
  const DISABLED_RANDOM =
    '// eslint-disable-next-line no-restricted-properties\nexport const r = Math.random();\n';

  it('ignores an inline eslint-disable comment', async () => {
    expect(await ruleIdsFor(CORE, DISABLED_RANDOM)).toContain('no-restricted-properties');
  });

  it('still honours inline disables outside core', async () => {
    expect(await ruleIdsFor(RENDER, DISABLED_RANDOM)).not.toContain('no-restricted-properties');
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

/**
 * Increment 2 closes the hole PLAN.md carried forward. `Date` is plain JavaScript, not DOM, so
 * neither tsconfig.core.json (which strips the DOM lib) nor the banned browser-globals list above
 * catches it — core could read the wall clock, pass every check, and silently stop replaying the
 * same run from the same seed. Time reaches core as `dt` and no other way.
 */
describe('the clock is banned inside core', () => {
  it('rejects Date.now() in core', async () => {
    expect(await ruleIdsFor(CORE, 'export const t = Date.now();\n')).toContain(
      'no-restricted-properties',
    );
  });

  it('rejects new Date() in core', async () => {
    expect(await ruleIdsFor(CORE, 'export const d = new Date();\n')).toContain(
      'no-restricted-syntax',
    );
  });

  it('ignores an inline eslint-disable for the clock', async () => {
    const disabled =
      '// eslint-disable-next-line no-restricted-properties\nexport const t = Date.now();\n';
    expect(await ruleIdsFor(CORE, disabled)).toContain('no-restricted-properties');
  });

  it('allows Date.now() outside core, where owning a clock is legitimate', async () => {
    expect(await ruleIdsFor(RENDER, 'export const t = Date.now();\n')).not.toContain(
      'no-restricted-properties',
    );
  });

  it('allows new Date() outside core', async () => {
    expect(await ruleIdsFor(RENDER, 'export const d = new Date();\n')).not.toContain(
      'no-restricted-syntax',
    );
  });
});
