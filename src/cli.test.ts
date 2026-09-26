import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import type { HistoryEntry } from './parse';
import { parseArgs, defaultHistoryFile, streamEntries } from './cli';

async function collect(gen: AsyncGenerator<HistoryEntry>): Promise<HistoryEntry[]> {
  const out: HistoryEntry[] = [];
  for await (const entry of gen) {
    out.push(entry);
  }
  return out;
}

test('parseArgs: defaults to zsh, top 10, no filters', () => {
  assert.deepEqual(parseArgs([]), {
    shell: 'zsh',
    file: join(homedir(), '.zsh_history'),
    top: 10,
    baseCommandOnly: false,
    json: false,
    since: null,
    until: null,
  });
});

test('parseArgs: --file overrides the shell default', () => {
  const options = parseArgs(['--shell', 'bash', '--file', '/tmp/custom_history']);
  assert.equal(options.file, '/tmp/custom_history');
});

test('parseArgs: --top, --base-command, --json, --since, --until', () => {
  const options = parseArgs([
    '--shell',
    'fish',
    '--top',
    '3',
    '--base-command',
    '--json',
    '--since',
    '1700000000',
    '--until',
    '1700086400',
  ]);
  assert.deepEqual(options, {
    shell: 'fish',
    file: defaultHistoryFile('fish'),
    top: 3,
    baseCommandOnly: true,
    json: true,
    since: 1700000000,
    until: 1700086400,
  });
});

test('parseArgs: rejects an unknown shell', () => {
  assert.throws(() => parseArgs(['--shell', 'tcsh']), /--shell must be one of bash, zsh, fish/);
});

test('parseArgs: rejects a flag missing its value', () => {
  assert.throws(() => parseArgs(['--top']), /--top requires a value/);
});

test('parseArgs: rejects an unrecognized argument', () => {
  assert.throws(() => parseArgs(['--color']), /unrecognized argument: --color/);
});

test('defaultHistoryFile: one path per shell, under the home directory', () => {
  assert.equal(defaultHistoryFile('bash'), join(homedir(), '.bash_history'));
  assert.equal(defaultHistoryFile('zsh'), join(homedir(), '.zsh_history'));
  assert.equal(
    defaultHistoryFile('fish'),
    join(homedir(), '.local', 'share', 'fish', 'fish_history')
  );
});

// These exercise the actual createReadStream -> readline -> stream parser
// pipeline against a real file, since every other test in this file (and
// in stream.test.ts) only ever hands the parsers an in-memory line source.
test('streamEntries: reads and parses a real bash history file from disk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shell-history-lens-'));
  try {
    const file = join(dir, '.bash_history');
    writeFileSync(file, '#1700000000\ngit status\nls\n');
    assert.deepEqual(await collect(streamEntries('bash', file)), [
      { command: 'git status', timestamp: 1700000000 },
      { command: 'ls', timestamp: null },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('streamEntries: reads a real zsh history file, rejoining a backslash-continued command', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shell-history-lens-'));
  try {
    const file = join(dir, '.zsh_history');
    writeFileSync(file, ': 1700000000:0;echo one \\\necho two\n: 1700000005:2;npm test\n');
    assert.deepEqual(await collect(streamEntries('zsh', file)), [
      { command: 'echo one \necho two', timestamp: 1700000000 },
      { command: 'npm test', timestamp: 1700000005 },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('streamEntries: reads a real fish history file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shell-history-lens-'));
  try {
    const file = join(dir, 'fish_history');
    writeFileSync(file, '- cmd: git status\n  when: 1700000000\n- cmd: npm test\n  when: 1700000005\n');
    assert.deepEqual(await collect(streamEntries('fish', file)), [
      { command: 'git status', timestamp: 1700000000 },
      { command: 'npm test', timestamp: 1700000005 },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('streamEntries: rejects when the file does not exist', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shell-history-lens-'));
  try {
    const file = join(dir, 'does-not-exist');
    await assert.rejects(collect(streamEntries('bash', file)), /ENOENT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
