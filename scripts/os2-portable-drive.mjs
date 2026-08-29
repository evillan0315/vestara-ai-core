#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  const value = i >= 0 ? args[i + 1] : undefined;
  if (!value || value.startsWith('/dev/') || value.startsWith('\\\\.\\'))
    throw new Error(`${name} must be a regular path, not a block device`);
  return resolve(value);
};
const hash = (data) => createHash('sha256').update(data).digest('hex');
const epoch = () => {
  const value = process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) : 0;
  if (!Number.isFinite(value) || value < 0) throw new Error('SOURCE_DATE_EPOCH must be non-negative');
  return value;
};
async function image() {
  const source = arg('--source');
  const output = arg('--output');
  const manifest = JSON.parse(await readFile(resolve(source, 'MANIFEST.json'), 'utf8'));
  if (manifest.format !== 'vestara-os1-portable-drive' || manifest.image)
    throw new Error('source must be an OS-1 staging tree');
  const timestamp = epoch();
  await mkdir(resolve(output, '..'), { recursive: true });
  await run('tar', [
    '--create',
    '--file',
    output,
    '--sort=name',
    '--format=ustar',
    `--mtime=@${timestamp}`,
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-C',
    source,
    '.',
  ]);
  const archive = await readFile(output);
  const metadata = {
    format: 'vestara-os2-portable-drive-image',
    version: 1,
    generatedAt: new Date(timestamp * 1000).toISOString(),
    artifact: 'tar',
    bootable: false,
    systemdBootEnabled: manifest.systemdBootEnabled === true,
    enabledServices: manifest.enabledServices ?? [],
    physicalDeviceWrite: false,
    sourceManifestSha256: hash(JSON.stringify(manifest)),
    archiveSha256: hash(archive),
    archiveBytes: archive.length,
  };
  await writeFile(`${output}.json`, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Created OS-2 archive at ${output}`);
}
async function verify() {
  const imagePath = arg('--image');
  const archive = await readFile(imagePath);
  const metadata = JSON.parse(await readFile(`${imagePath}.json`, 'utf8'));
  if (metadata.format !== 'vestara-os2-portable-drive-image' || metadata.physicalDeviceWrite !== false)
    throw new Error('invalid OS-2 metadata');
  if (hash(archive) !== metadata.archiveSha256) throw new Error('archive hash mismatch');
  console.log(`Verified ${imagePath}`);
}
try {
  if (args[0] === 'plan')
    console.log(
      JSON.stringify(
        {
          format: 'vestara-os2-portable-drive-image',
          version: 1,
          artifact: 'tar',
          bootable: false,
          systemdBootEnabled: true,
          physicalDeviceWrite: false,
        },
        null,
        2,
      ),
    );
  else if (args[0] === 'image') await image();
  else if (args[0] === 'verify') await verify();
  else
    throw new Error(
      'Usage: node scripts/os2-portable-drive.mjs plan | image --source <os1-tree> --output <tar> | verify --image <tar>',
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
