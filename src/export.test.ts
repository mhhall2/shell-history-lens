import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HistoryEntry } from './parse';
import { toExportableEntries, toJSON } from './export';

test('toExportableEntries: converts epoch seconds to ISO 8601 strings', () => {
  const entries: HistoryEntry[] = [{ command: 'git status', timestamp: 1700000000 }];
  assert.deepEqual(toExportableEntries(entries), [
    { command: 'git status', timestamp: '2023-11-14T22:13:20.000Z' },
  ]);
});

test('toExportableEntries: leaves a null timestamp as null', () => {
  const entries: HistoryEntry[] = [{ command: 'ls', timestamp: null }];
  assert.deepEqual(toExportableEntries(entries), [{ command: 'ls', timestamp: null }]);
});

test('toJSON: compact by default', () => {
  const entries: HistoryEntry[] = [{ command: 'ls', timestamp: null }];
  assert.equal(toJSON(entries), '[{"command":"ls","timestamp":null}]');
});

test('toJSON: pretty option indents with 2 spaces', () => {
  const entries: HistoryEntry[] = [{ command: 'ls', timestamp: null }];
  assert.equal(
    toJSON(entries, { pretty: true }),
    '[\n  {\n    "command": "ls",\n    "timestamp": null\n  }\n]'
  );
});
