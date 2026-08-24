import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HistoryEntry } from './parse';
import {
  dedupe,
  extractBaseCommand,
  frequencyByCommand,
  mostUsed,
  filterByTimeRange,
} from './stats';

function entry(command: string, timestamp: number | null = null): HistoryEntry {
  return { command, timestamp };
}

test('dedupe: default keeps the last occurrence but the first position', () => {
  const entries = [entry('ls', 1), entry('git status', 2), entry('ls', 3)];
  assert.deepEqual(dedupe(entries), [entry('ls', 3), entry('git status', 2)]);
});

test('dedupe: keep "first" keeps the earliest occurrence', () => {
  const entries = [entry('ls', 1), entry('git status', 2), entry('ls', 3)];
  assert.deepEqual(dedupe(entries, { keep: 'first' }), [entry('ls', 1), entry('git status', 2)]);
});

test('extractBaseCommand: strips leading env assignments and sudo', () => {
  assert.equal(extractBaseCommand('git status'), 'git');
  assert.equal(extractBaseCommand('sudo apt update'), 'apt');
  assert.equal(extractBaseCommand('FOO=bar BAZ=qux npm test'), 'npm');
  assert.equal(extractBaseCommand('FOO=bar sudo npm test'), 'npm');
});

test('extractBaseCommand: returns an empty string for blank or assignment-only input', () => {
  assert.equal(extractBaseCommand(''), '');
  assert.equal(extractBaseCommand('   '), '');
  assert.equal(extractBaseCommand('FOO=bar'), '');
});

test('frequencyByCommand: counts occurrences and sorts by count then alphabetically', () => {
  const entries = [entry('ls'), entry('git status'), entry('ls'), entry('npm test'), entry('ls')];
  assert.deepEqual(frequencyByCommand(entries), [
    { command: 'ls', count: 3 },
    { command: 'git status', count: 1 },
    { command: 'npm test', count: 1 },
  ]);
});

test('frequencyByCommand: baseCommandOnly groups by binary and skips blanks', () => {
  const entries = [entry('git status'), entry('git commit -m x'), entry('FOO=bar'), entry('sudo npm test')];
  assert.deepEqual(frequencyByCommand(entries, { baseCommandOnly: true }), [
    { command: 'git', count: 2 },
    { command: 'npm', count: 1 },
  ]);
});

test('mostUsed: slices the top N by frequency', () => {
  const entries = [entry('ls'), entry('ls'), entry('git'), entry('npm')];
  assert.deepEqual(mostUsed(entries, 2), [
    { command: 'ls', count: 2 },
    { command: 'git', count: 1 },
  ]);
});

test('filterByTimeRange: both bounds are inclusive and null timestamps are excluded', () => {
  const entries = [entry('a', 100), entry('b', 200), entry('c', 300), entry('d', null)];
  assert.deepEqual(filterByTimeRange(entries, 100, 200), [entry('a', 100), entry('b', 200)]);
});
