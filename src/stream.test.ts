import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HistoryEntry, UnmatchedLine } from './parse';
import { streamBashHistory, streamZshHistory, streamFishHistory } from './stream';

async function* toAsyncLines(text: string): AsyncGenerator<string> {
  for (const line of text.split('\n')) {
    yield line;
  }
}

async function collect(gen: AsyncGenerator<HistoryEntry>): Promise<HistoryEntry[]> {
  const out: HistoryEntry[] = [];
  for await (const entry of gen) {
    out.push(entry);
  }
  return out;
}

test('streamBashHistory: matches parseBashHistory for a well-formed file', async () => {
  const text = '#1700000000\ngit status\nls\n#1700000100\nnpm test\n';
  const entries = await collect(streamBashHistory(toAsyncLines(text)));
  assert.deepEqual(entries, [
    { command: 'git status', timestamp: 1700000000 },
    { command: 'ls', timestamp: null },
    { command: 'npm test', timestamp: 1700000100 },
  ]);
});

test('streamBashHistory: accepts a plain sync iterable, not just async', async () => {
  const entries = await collect(streamBashHistory(['ls -la', 'git status']));
  assert.deepEqual(entries, [
    { command: 'ls -la', timestamp: null },
    { command: 'git status', timestamp: null },
  ]);
});

test('streamBashHistory: reports unmatched lines through the callback as it goes', async () => {
  const text = 'git status\n#170000abc\nls\n';
  const unmatched: UnmatchedLine[] = [];
  const entries = await collect(
    streamBashHistory(toAsyncLines(text), { onUnmatchedLine: (line) => unmatched.push(line) })
  );
  assert.deepEqual(unmatched, [{ line: 2, text: '#170000abc' }]);
  assert.deepEqual(entries, [
    { command: 'git status', timestamp: null },
    { command: '#170000abc', timestamp: null },
    { command: 'ls', timestamp: null },
  ]);
});

test('streamZshHistory: matches parseZshHistory for extended history lines', async () => {
  const text = ': 1700000000:0;git status\n: 1700000005:2;npm test\n';
  const entries = await collect(streamZshHistory(toAsyncLines(text)));
  assert.deepEqual(entries, [
    { command: 'git status', timestamp: 1700000000 },
    { command: 'npm test', timestamp: 1700000005 },
  ]);
});

test('streamZshHistory: rejoins backslash-continued multi-line commands across chunks', async () => {
  const text = ': 1700000000:0;echo one \\\necho two\n';
  const entries = await collect(streamZshHistory(toAsyncLines(text)));
  assert.deepEqual(entries, [{ command: 'echo one \necho two', timestamp: 1700000000 }]);
});

test('streamZshHistory: reports the starting line of a malformed multi-line command', async () => {
  const text = 'ls\n: abc:0;echo one \\\necho two\n';
  const unmatched: UnmatchedLine[] = [];
  await collect(streamZshHistory(toAsyncLines(text), { onUnmatchedLine: (line) => unmatched.push(line) }));
  assert.deepEqual(unmatched, [{ line: 2, text: ': abc:0;echo one \necho two' }]);
});

test('streamFishHistory: pairs cmd with the when that follows it', async () => {
  const text = '- cmd: git status\n  when: 1700000000\n- cmd: npm test\n  when: 1700000005\n';
  const entries = await collect(streamFishHistory(toAsyncLines(text)));
  assert.deepEqual(entries, [
    { command: 'git status', timestamp: 1700000000 },
    { command: 'npm test', timestamp: 1700000005 },
  ]);
});

test('streamFishHistory: a truncated final entry with no when: still comes through', async () => {
  const text = '- cmd: git status\n  when: 1700000000\n- cmd: npm test\n';
  const entries = await collect(streamFishHistory(toAsyncLines(text)));
  assert.deepEqual(entries, [
    { command: 'git status', timestamp: 1700000000 },
    { command: 'npm test', timestamp: null },
  ]);
});

test('streamFishHistory: reports a completely unrecognized line', async () => {
  const text = '- cmd: git status\n  when: 1700000000\nsome garbage line\n';
  const unmatched: UnmatchedLine[] = [];
  await collect(streamFishHistory(toAsyncLines(text), { onUnmatchedLine: (line) => unmatched.push(line) }));
  assert.deepEqual(unmatched, [{ line: 3, text: 'some garbage line' }]);
});
