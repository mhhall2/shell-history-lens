import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBashHistory, parseZshHistory, parseFishHistory } from './parse';

test('parseBashHistory: plain history has no timestamps', () => {
  const entries = parseBashHistory('ls -la\ngit status\n');
  assert.deepEqual(entries, [
    { command: 'ls -la', timestamp: null },
    { command: 'git status', timestamp: null },
  ]);
});

test('parseBashHistory: attaches a #<epoch> line only to the command that follows it', () => {
  const text = '#1700000000\ngit status\nls\n#1700000100\nnpm test\n';
  const entries = parseBashHistory(text);
  assert.deepEqual(entries, [
    { command: 'git status', timestamp: 1700000000 },
    { command: 'ls', timestamp: null },
    { command: 'npm test', timestamp: 1700000100 },
  ]);
});

test('parseBashHistory: ignores blank lines and a trailing timestamp with no command', () => {
  const entries = parseBashHistory('\nls\n\n#1700000000\n');
  assert.deepEqual(entries, [{ command: 'ls', timestamp: null }]);
});

test('parseZshHistory: parses EXTENDED_HISTORY lines', () => {
  const entries = parseZshHistory(': 1700000000:0;git status\n: 1700000005:2;npm test\n');
  assert.deepEqual(entries, [
    { command: 'git status', timestamp: 1700000000 },
    { command: 'npm test', timestamp: 1700000005 },
  ]);
});

test('parseZshHistory: falls back to plain lines with no timestamp', () => {
  const entries = parseZshHistory('ls -la\n: 1700000000:0;git status\n');
  assert.deepEqual(entries, [
    { command: 'ls -la', timestamp: null },
    { command: 'git status', timestamp: 1700000000 },
  ]);
});

test('parseZshHistory: rejoins backslash-continued multi-line commands', () => {
  const text = ': 1700000000:0;echo one \\\necho two\n';
  const entries = parseZshHistory(text);
  assert.deepEqual(entries, [{ command: 'echo one \necho two', timestamp: 1700000000 }]);
});

test('parseZshHistory: an escaped trailing backslash does not trigger continuation', () => {
  const entries = parseZshHistory(': 1700000000:0;echo foo\\\\\n');
  assert.deepEqual(entries, [{ command: 'echo foo\\\\', timestamp: 1700000000 }]);
});

test('parseFishHistory: pairs cmd with the when that follows it', () => {
  const text = '- cmd: git status\n  when: 1700000000\n- cmd: npm test\n  when: 1700000005\n';
  const entries = parseFishHistory(text);
  assert.deepEqual(entries, [
    { command: 'git status', timestamp: 1700000000 },
    { command: 'npm test', timestamp: 1700000005 },
  ]);
});

test('parseFishHistory: a command missing a when: gets a null timestamp instead of being dropped', () => {
  const text = '- cmd: git status\n- cmd: npm test\n  when: 1700000005\n';
  const entries = parseFishHistory(text);
  assert.deepEqual(entries, [
    { command: 'git status', timestamp: null },
    { command: 'npm test', timestamp: 1700000005 },
  ]);
});

test('parseFishHistory: a truncated final entry with no when: still comes through', () => {
  const text = '- cmd: git status\n  when: 1700000000\n- cmd: npm test\n';
  const entries = parseFishHistory(text);
  assert.deepEqual(entries, [
    { command: 'git status', timestamp: 1700000000 },
    { command: 'npm test', timestamp: null },
  ]);
});

test('parseFishHistory: unescapes \\\\ and \\n in the command', () => {
  const text = '- cmd: echo one\\nline two \\\\ literal\n  when: 1700000000\n';
  const entries = parseFishHistory(text);
  assert.deepEqual(entries, [
    { command: 'echo one\nline two \\ literal', timestamp: 1700000000 },
  ]);
});
