#!/usr/bin/env node
/** Documentation governance and status automation for Vestara. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const GENERATED = path.join(DOCS, 'generated');
const args = process.argv.slice(2);
const command = args[0] ?? 'validate';
const strict = args.includes('--strict');

function walk(dir, predicate = () => true, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'generated', 'api'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, predicate, result);
    else if (predicate(file)) result.push(file);
  }
  return result;
}

function documents() {
  return walk(DOCS, (file) => file.endsWith('.md')).map((file) => ({ file, ...parseDocument(file) }));
}

function parseDocument(file) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.startsWith('---')) return { source, metadata: {}, body: source };
  const end = source.indexOf('\n---', 3);
  if (end < 0) return { source, metadata: {}, body: source, malformed: true };
  const metadata = {};
  for (const line of source.slice(4, end).split('\n')) {
    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    metadata[match[1]] = value;
  }
  return { source, metadata, body: source.slice(end + 4), malformed: false };
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, '/');
}
function output(name, value) {
  fs.mkdirSync(GENERATED, { recursive: true });
  const target = path.join(GENERATED, name);
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
}

function validate() {
  const required = ['title', 'version', 'status', 'owner', 'last-reviewed', 'next-review'];
  const findings = [];
  for (const doc of documents()) {
    if (!Object.keys(doc.metadata).length) {
      findings.push({
        severity: 'warning',
        file: rel(doc.file),
        code: 'missing-frontmatter',
        message: 'Document has no governed frontmatter',
      });
      continue;
    }
    if (doc.malformed)
      findings.push({
        severity: 'error',
        file: rel(doc.file),
        code: 'malformed-frontmatter',
        message: 'Frontmatter does not have a closing delimiter',
      });
    for (const key of required)
      if (!doc.metadata[key])
        findings.push({
          severity: strict ? 'error' : 'warning',
          file: rel(doc.file),
          code: `missing-${key}`,
          message: `Missing required field: ${key}`,
        });
    for (const key of ['last-reviewed', 'next-review'])
      if (doc.metadata[key] && !/^\d{4}-\d{2}-\d{2}$/.test(doc.metadata[key]))
        findings.push({
          severity: 'error',
          file: rel(doc.file),
          code: `invalid-${key}`,
          message: `${key} must use YYYY-MM-DD`,
        });
    if (['implemented', 'verified'].includes(doc.metadata.status)) {
      for (const key of ['implementation-repository', 'implementation-commit'])
        if (!doc.metadata[key])
          findings.push({
            severity: strict ? 'error' : 'warning',
            file: rel(doc.file),
            code: `missing-${key}`,
            message: `${doc.metadata.status} documents need ${key}`,
          });
      if (/^(main|master|local main|HEAD|latest)$/i.test(doc.metadata['implementation-commit'] ?? ''))
        findings.push({
          severity: 'error',
          file: rel(doc.file),
          code: 'mutable-implementation-ref',
          message: 'Implementation reference must be an immutable commit SHA',
        });
    }
  }
  output('validation.json', { generatedAt: new Date().toISOString(), strict, findings });
  printFindings(findings);
  if (findings.some((item) => item.severity === 'error')) process.exitCode = 1;
}

function printFindings(findings) {
  console.log(`Documentation validation: ${findings.length ? `${findings.length} finding(s)` : 'passed'}`);
  for (const item of findings.slice(0, 100))
    console.log(`${item.severity === 'error' ? '✖' : '⚠'} ${item.file}: ${item.message}`);
}

function status() {
  const rows = documents()
    .filter((doc) => Object.keys(doc.metadata).length)
    .map((doc) => ({
      file: rel(doc.file),
      id: doc.metadata.id ?? rel(doc.file),
      title: doc.metadata.title,
      status: doc.metadata.status ?? 'unknown',
      version: doc.metadata.version,
      implementationCommit: doc.metadata['implementation-commit'],
    }));
  output('status.json', { generatedAt: new Date().toISOString(), documents: rows });
  const md = [
    '# Generated Documentation Status',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Document | Status | Version | Implementation |',
    '|---|---|---|---|',
    ...rows.map((row) => `| ${row.file} | ${row.status} | ${row.version ?? ''} | ${row.implementationCommit ?? ''} |`),
    '',
  ];
  fs.mkdirSync(GENERATED, { recursive: true });
  fs.writeFileSync(path.join(GENERATED, 'STATUS.md'), md.join('\n'));
  console.log(`Generated status for ${rows.length} governed documents`);
}

function reviewDue() {
  const today = new Date().toISOString().slice(0, 10);
  const due = documents()
    .filter((doc) => doc.metadata['next-review'] && doc.metadata['next-review'] < today)
    .map((doc) => ({
      file: rel(doc.file),
      nextReview: doc.metadata['next-review'],
      owner: doc.metadata.owner,
      status: doc.metadata.status,
    }));
  output('review-due.json', { generatedAt: new Date().toISOString(), today, documents: due });
  console.log(due.length ? `${due.length} document(s) require review` : 'No overdue documentation reviews');
  for (const item of due) console.log(`⚠ ${item.file} · due ${item.nextReview}`);
}

function links() {
  const broken = [];
  for (const doc of documents()) {
    for (const match of doc.source.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
      const target = match[1];
      if (target.startsWith('http') || target.startsWith('mailto:') || target.startsWith('#')) continue;
      const resolved = path.resolve(path.dirname(doc.file), target);
      if (!fs.existsSync(resolved)) broken.push({ file: rel(doc.file), target });
    }
  }
  output('links.json', { generatedAt: new Date().toISOString(), broken });
  console.log(broken.length ? `${broken.length} broken documentation link(s)` : 'Documentation links passed');
  if (strict && broken.length) process.exitCode = 1;
}

function drift() {
  const packageFiles = walk(path.join(ROOT, 'packages'), (file) => path.basename(file) === 'package.json').concat(
    walk(path.join(ROOT, 'apps'), (file) => path.basename(file) === 'package.json'),
  );
  const packageNames = packageFiles.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')).name).filter(Boolean);
  const source = documents()
    .map((doc) => doc.source)
    .join('\n');
  const undocumented = packageNames.filter((name) => !source.includes(name));
  const report = {
    generatedAt: new Date().toISOString(),
    packages: packageNames.length,
    undocumentedPackages: undocumented,
  };
  output('drift.json', report);
  console.log(
    undocumented.length
      ? `${undocumented.length} package(s) are not referenced by documentation`
      : 'Documentation drift check passed',
  );
}

function evidence() {
  const evidenceDir = path.join(DOCS, 'evidence');
  const manifests = walk(evidenceDir, (file) => file.endsWith('.json')).map((file) => {
    try {
      return { file: rel(file), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      return { file: rel(file), invalid: true };
    }
  });
  const invalid = manifests.filter(
    (item) => item.invalid || !item.runId || !item.repository || !item.commit || !item.timestamp,
  );
  output('evidence.json', { generatedAt: new Date().toISOString(), manifests, invalid });
  console.log(
    invalid.length
      ? `${invalid.length} invalid evidence manifest(s)`
      : `Evidence manifests passed (${manifests.length})`,
  );
  if (strict && invalid.length) process.exitCode = 1;
}

function impact() {
  const id = args[1];
  if (!id) {
    console.error('Usage: docs impact <document-id-or-path>');
    process.exitCode = 1;
    return;
  }
  const matches = documents().filter(
    (doc) => doc.metadata.id === id || rel(doc.file) === id || path.basename(doc.file, '.md') === id,
  );
  const references = [];
  for (const doc of documents()) if (doc.source.includes(id) && !matches.includes(doc)) references.push(rel(doc.file));
  const report = {
    generatedAt: new Date().toISOString(),
    target: id,
    matches: matches.map((doc) => rel(doc.file)),
    references,
  };
  output(`impact-${id.replace(/[^a-z0-9_-]/gi, '_')}.json`, report);
  console.log(JSON.stringify(report, null, 2));
}

switch (command) {
  case 'validate':
    validate();
    break;
  case 'status':
    status();
    break;
  case 'review-due':
    reviewDue();
    break;
  case 'links':
    links();
    break;
  case 'drift':
    drift();
    break;
  case 'evidence':
    evidence();
    break;
  case 'impact':
    impact();
    break;
  default:
    console.error('Usage: docs-automation <validate|status|review-due|links|drift|evidence|impact> [id] [--strict]');
    process.exitCode = 1;
}
