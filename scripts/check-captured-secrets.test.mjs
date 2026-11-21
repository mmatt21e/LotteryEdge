import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanText, scanTrackedFiles } from './check-captured-secrets.mjs';

const synthetic = 'AI' + 'za' + 'x'.repeat(35);
test('detects keys with safe path/line only', () => {
  const result = scanText(`first\n${synthetic}\n${synthetic}`, 'capture.txt');
  assert.deepEqual(result, [{path:'capture.txt', line:2}, {path:'capture.txt', line:3}]);
  assert.equal(JSON.stringify(result).includes(synthetic), false);
});
test('ignores redacted placeholders and short prefixes', () => {
  assert.deepEqual(scanText('[REDACTED_GOOGLE_KEY] AIza123', 'safe.txt'), []);
});
test('scans tracked files including unusual filenames; CLI fails without leaking value', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'lotteryedge-secret-test-'));
  try {
    execFileSync('git', ['init', '--quiet'], {cwd});
    writeFileSync(join(cwd, 'capture with spaces.txt'), synthetic);
    writeFileSync(join(cwd, 'untracked.txt'), synthetic);
    execFileSync('git', ['add', 'capture with spaces.txt'], {cwd});
    assert.deepEqual(scanTrackedFiles(cwd), [{path:'capture with spaces.txt', line:1}]);
    const script = fileURLToPath(new URL('./check-captured-secrets.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], {cwd, encoding:'utf8'});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /value withheld/);
    assert.equal((result.stdout + result.stderr).includes(synthetic), false);
    writeFileSync(join(cwd, 'capture with spaces.txt'), '[REDACTED_GOOGLE_KEY]');
    assert.equal(spawnSync(process.execPath, [script], {cwd}).status, 0);
  } finally {
    rmSync(cwd, {recursive:true, force:true});
  }
});
