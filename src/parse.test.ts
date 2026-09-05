import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBashHistory,
  parseZshHistory,
  parseFishHistory,
  parseBashHistoryDetailed,
  parseZshHistoryDetailed,
  parseFishHistoryDetailed,
} from './parse';

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

test('parseBashHistoryDetailed: a well-formed file has no unmatched lines', () => {
  const result = parseBashHistoryDetailed('#1700000000\ngit status\nls\n');
  assert.deepEqual(result.unmatchedLines, []);
});

test('parseBashHistoryDetailed: reports a #-line that is not a clean epoch timestamp', () => {
  const result = parseBashHistoryDetailed('git status\n#170000abc\nls\n');
  assert.deepEqual(result.unmatchedLines, [{ line: 2, text: '#170000abc' }]);
  assert.deepEqual(result.entries, [
    { command: 'git status', timestamp: null },
    { command: '#170000abc', timestamp: null },
    { command: 'ls', timestamp: null },
  ]);
});

test('parseZshHistoryDetailed: a well-formed file has no unmatched lines', () => {
  const result = parseZshHistoryDetailed(': 1700000000:0;git status\nls -la\n');
  assert.deepEqual(result.unmatchedLines, []);
});

test('parseZshHistoryDetailed: reports a line that starts like extended history but does not parse', () => {
  const result = parseZshHistoryDetailed(': abc:0;git status\nnpm test\n');
  assert.deepEqual(result.unmatchedLines, [{ line: 1, text: ': abc:0;git status' }]);
  assert.deepEqual(result.entries, [
    { command: ': abc:0;git status', timestamp: null },
    { command: 'npm test', timestamp: null },
  ]);
});

test('parseZshHistoryDetailed: reports the starting line of a malformed multi-line command', () => {
  const text = 'ls\n: abc:0;echo one \\\necho two\n';
  const result = parseZshHistoryDetailed(text);
  assert.deepEqual(result.unmatchedLines, [{ line: 2, text: ': abc:0;echo one \necho two' }]);
});

test('parseFishHistoryDetailed: a well-formed file has no unmatched lines', () => {
  const text = '- cmd: git status\n  when: 1700000000\n  paths:\n    - /tmp/a\n';
  const result = parseFishHistoryDetailed(text);
  assert.deepEqual(result.unmatchedLines, []);
});

test('parseFishHistoryDetailed: reports a when: with a non-numeric value', () => {
  const text = '- cmd: git status\n  when: not-a-number\n- cmd: npm test\n  when: 1700000005\n';
  const result = parseFishHistoryDetailed(text);
  assert.deepEqual(result.unmatchedLines, [{ line: 2, text: '  when: not-a-number' }]);
  assert.deepEqual(result.entries, [
    { command: 'git status', timestamp: null },
    { command: 'npm test', timestamp: 1700000005 },
  ]);
});

test('parseFishHistoryDetailed: reports a completely unrecognized line', () => {
  const text = '- cmd: git status\n  when: 1700000000\nsome garbage line\n';
  const result = parseFishHistoryDetailed(text);
  assert.deepEqual(result.unmatchedLines, [{ line: 3, text: 'some garbage line' }]);
});
