'use strict';
// Runs every tests/*.test.js in its own child process (isolated globals — one test file's jsdom
// window can't leak into another's) and prints a one-line pass/fail summary per file, then an
// overall summary. Exits non-zero if any file failed, so `npm test` fails loudly in a way a
// script or a person skimming the log can't miss.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();

if (files.length === 0) {
  console.log('No tests/*.test.js files found.');
  process.exit(1);
}

let failedFiles = [];
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  try {
    const output = execFileSync(process.execPath, [path.join(dir, file)], { encoding: 'utf8' });
    process.stdout.write(output);
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    failedFiles.push(file);
  }
}

console.log('\n' + '='.repeat(50));
if (failedFiles.length) {
  console.log(`FAILED: ${failedFiles.length} of ${files.length} test files — ${failedFiles.join(', ')}`);
  process.exit(1);
} else {
  console.log(`All ${files.length} test files passed.`);
}
