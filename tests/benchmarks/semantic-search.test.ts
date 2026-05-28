import { describe, it, beforeAll, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Doc = { key: string; value: string };
type Query = {
  query: string;
  expected_top_key: string;
  baseline_scores: Record<string, number>;
};
type Spec = {
  namespace: string;
  documents: Doc[];
  queries: Query[];
  pass_criteria: { score_drift_warn_pct: number };
};

const specPath = resolve(__dirname, 'semantic-search.json');
const spec: Spec = JSON.parse(readFileSync(specPath, 'utf8'));

function shellQuote(s: string) {
  if (process.platform === 'win32') {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function run(args: string[]) {
  const cmd = ['claude-flow', ...args.map(shellQuote)].join(' ');
  return spawnSync(cmd, [], {
    encoding: 'utf8',
    shell: true,
    timeout: 60_000,
  });
}

const probe = run(['--version']);
const cliAvailable = probe.status === 0;

const dbProbe = cliAvailable
  ? run(['memory', 'stats'])
  : { status: 1, stdout: '', stderr: '' };
const dbReady =
  cliAvailable &&
  dbProbe.status === 0 &&
  !/(Database not found|memory init)/i.test(
    `${dbProbe.stdout}\n${dbProbe.stderr}`,
  );

const suite = cliAvailable && dbReady ? describe : describe.skip;
const skipReason = !cliAvailable
  ? 'claude-flow CLI not on PATH'
  : !dbReady
    ? 'memory DB not initialized — run `claude-flow memory init`'
    : '';

const runNamespace = `${spec.namespace}-${Date.now()}`;

suite(`semantic-search benchmark${skipReason ? ` (skipped: ${skipReason})` : ''}`, () => {
  beforeAll(() => {
    for (const doc of spec.documents) {
      const r = run([
        'memory',
        'store',
        '--key',
        doc.key,
        '--value',
        doc.value,
        '--namespace',
        runNamespace,
      ]);
      if (r.status !== 0) {
        throw new Error(
          `Failed to seed ${doc.key}: ${r.stderr || r.stdout}`,
        );
      }
    }
  }, 120_000);

  for (const q of spec.queries) {
    it(
      `ranks "${q.expected_top_key}" first for: ${q.query}`,
      () => {
        const r = run([
          'memory',
          'search',
          '--query',
          q.query,
          '--namespace',
          runNamespace,
        ]);
        expect(r.status, r.stderr || r.stdout).toBe(0);

        const rows = [...r.stdout.matchAll(
          /^\|\s+([A-Za-z0-9_-]+)\s+\|\s+(\d+\.\d+)\s+\|/gm,
        )].map((m) => ({ key: m[1], score: parseFloat(m[2]) }));

        expect(rows.length, 'no result rows parsed from CLI output').toBeGreaterThan(0);
        expect(rows[0].key).toBe(q.expected_top_key);

        const warnPct = spec.pass_criteria.score_drift_warn_pct ?? 10;
        for (const row of rows) {
          const baseline = q.baseline_scores[row.key];
          if (baseline === undefined) continue;
          const driftPct = Math.abs((row.score - baseline) / baseline) * 100;
          if (driftPct > warnPct) {
            console.warn(
              `[drift] ${q.query} -> ${row.key}: ${row.score.toFixed(2)} vs baseline ${baseline.toFixed(2)} (${driftPct.toFixed(1)}%)`,
            );
          }
        }
      },
      60_000,
    );
  }
});
