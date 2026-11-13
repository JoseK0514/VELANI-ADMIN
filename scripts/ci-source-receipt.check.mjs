import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureSource, verifySource, verifyTests } from './ci-source-receipt.mjs';

const files = ['test/auth.test.ts', 'test/retention.test.ts'];
const report = () => ({
  success: true, numTotalTests: 2, numPassedTests: 2, numFailedTests: 0,
  numPendingTests: 0, numTodoTests: 0,
  testResults: files.map(name => ({ name: '/owned/repo/' + name, status: 'passed',
    assertionResults: [{ title: name, status: 'passed' }] })),
});

test('accepts every discovered test file with only executed passing assertions', () => {
  assert.deepEqual(verifyTests(report(), files, '/owned/repo'), { files: 2, passed: 2 });
});
for (const [name, mutate] of [
  ['failed assertion', r => { r.testResults[0].assertionResults[0].status = 'failed'; }],
  ['skipped assertion despite green counters', r => { r.testResults[0].assertionResults[0].status = 'pending'; }],
  ['skipped count', r => { r.numPendingTests = 1; }],
  ['missing test file', r => { r.testResults.pop(); }],
  ['duplicate file', r => { r.testResults[1] = r.testResults[0]; }],
  ['test file from another checkout', r => { r.testResults[0].name = '/foreign/repo/test/auth.test.ts'; }],
  ['failed suite', r => { r.testResults[0].status = 'failed'; }],
  ['inconsistent total', r => { r.numTotalTests = 3; }],
  ['empty assertions', r => { r.testResults[0].assertionResults = []; }],
  ['unsuccessful run', r => { r.success = false; }],
]) test('rejects ' + name, () => {
  const input = report(); mutate(input);
  assert.throws(() => verifyTests(input, files, '/owned/repo'));
});

test('binds all tracked bytes, source SHA and tree and refuses source changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'admin-ci-source-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-q'); mkdirSync(join(root, 'test'));
    writeFileSync(join(root, 'test/auth.test.ts'), 'synthetic source');
    git('add', '.');
    git('-c', 'user.name=CI fixture', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'fixture');
    const receipt = captureSource(root);
    assert.equal(receipt.sha, git('rev-parse', 'HEAD'));
    assert.equal(receipt.tree, git('rev-parse', 'HEAD^{tree}'));
    assert.equal(Object.keys(receipt.files).length, 1);
    verifySource(receipt, root);
    assert.throws(() => verifySource({ ...receipt, sha: '0'.repeat(40) }, root));
    assert.throws(() => verifySource({ ...receipt, files: {} }, root));
    writeFileSync(join(root, 'test/auth.test.ts'), 'changed source');
    assert.throws(() => verifySource(receipt, root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
