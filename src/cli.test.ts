import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, defaultHistoryFile } from './cli';

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
