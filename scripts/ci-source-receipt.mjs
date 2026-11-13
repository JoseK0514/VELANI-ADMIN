import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

export function captureSource(root) {
  const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
  assert(paths.length > 0, 'Source inventory is empty');
  return { sha: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    files: Object.fromEntries(paths.map(path => [path, hash(readFileSync(resolve(root, path)))])) };
}

export function verifySource(receipt, root) {
  assert.deepEqual(captureSource(root), receipt, 'Source changed during qualification or receipt belongs to another source');
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=no'), '', 'Tracked source must be clean');
}

export function verifyTests(report, expectedFiles, root) {
  assert.equal(report.success, true, 'Test run was unsuccessful');
  for (const key of ['numFailedTests', 'numPendingTests', 'numTodoTests']) assert.equal(report[key] ?? 0, 0, key);
  assert(expectedFiles.length > 0, 'No test files found');
  assert(Array.isArray(report.testResults), 'Missing test results');
  const seen = [], assertions = [];
  for (const suite of report.testResults) {
    const name = relative(root, suite.name);
    assert(!seen.includes(name), 'Duplicate test file');
    seen.push(name);
    assert.equal(suite.status, 'passed', 'Test file did not pass');
    assert(suite.assertionResults?.length > 0, 'Test file has no executed assertions');
    for (const result of suite.assertionResults) { assert.equal(result.status, 'passed', 'Nonpassing assertion'); assertions.push(result); }
  }
  assert.deepEqual(seen.sort(), [...expectedFiles].sort(), 'Missing or foreign test file');
  assert.equal(report.numTotalTests, assertions.length, 'Test total differs from executed assertions');
  assert.equal(report.numPassedTests, assertions.length, 'Passed count differs from executed assertions');
  return { files: seen.length, passed: assertions.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, directory] = process.argv.slice(2), root = process.cwd();
  assert(directory && ['capture', 'verify'].includes(command), 'Use capture|verify EVIDENCE_DIRECTORY');
  const sourcePath = resolve(directory, 'source.json');
  if (command === 'capture') {
    const source = captureSource(root);
    verifySource(source, root);
    assert(!process.env.GITHUB_SHA || process.env.GITHUB_SHA === source.sha, 'Runner/source SHA mismatch');
    writeFileSync(sourcePath, JSON.stringify(source, null, 2) + '\n');
  } else {
    const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
    verifySource(source, root);
    assert(!process.env.GITHUB_SHA || process.env.GITHUB_SHA === source.sha, 'Runner/source SHA mismatch');
    const bytes = readFileSync(resolve(directory, 'tests.json'));
    const tests = verifyTests(JSON.parse(bytes), Object.keys(source.files).filter(p => /^test\/.*\.test\.ts$/.test(p)), root);
    const receipt = { schema: 1, ...source, tests, reportSha256: hash(bytes),
      run: { id: process.env.GITHUB_RUN_ID ?? null, attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
        ref: process.env.GITHUB_REF ?? null, event: process.env.GITHUB_EVENT_NAME ?? null },
      environment: 'owned-loopback-postgresql', deploymentPerformed: false };
    writeFileSync(resolve(directory, 'qualification.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ sha: source.sha, tree: source.tree, trackedFiles: Object.keys(source.files).length, ...tests }));
  }
}
