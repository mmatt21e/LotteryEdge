import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Targeted guard for Google API keys accidentally saved in captured responses.
// Never include matched credential values in output.
export function scanText(text, path) {
  const findings = [];
  for (const match of text.matchAll(/AIza[0-9A-Za-z_-]{35}/g)) {
    findings.push({ path, line: text.slice(0, match.index).split('\n').length });
  }
  return findings;
}

export function scanTrackedFiles(cwd = process.cwd()) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
  return files.flatMap(path => scanText(readFileSync(resolve(cwd, path), 'utf8'), path));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const findings = scanTrackedFiles();
  for (const item of findings) console.error(`${item.path}:${item.line}: possible Google API key (value withheld)`);
  if (findings.length) process.exitCode = 1;
  else console.log('No Google API key patterns found in tracked files.');
}
