#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const layout = [
  'boot/efi',
  'boot/vestara',
  'etc/vestara',
  'etc/systemd/system',
  'opt/vestara',
  'opt/vestara/.vestara',
  'var/lib/vestara',
  'var/lib/vestara/workspaces',
  'var/log/vestara',
];
const args = process.argv.slice(2);
const outputPath = () => {
  const value = args[args.indexOf('--output') + 1];
  if (!value || value.startsWith('/dev/') || value.startsWith('\\\\.\\'))
    throw new Error('--output must be a directory path, not a block device');
  return resolve(value);
};
const digest = async (path) => {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
};
const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else files.push(path);
  }
  return files.sort();
};
async function stage() {
  const output = outputPath();
  if (args.includes('--clean')) await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const directory of layout) await mkdir(join(output, directory), { recursive: true });
  const units = (await readdir(join(root, 'os/systemd')))
    .filter((name) => name.endsWith('.service') || name.endsWith('.target'))
    .sort();
  for (const unit of units) await cp(join(root, 'os/systemd', unit), join(output, 'etc/systemd/system', unit));
  const services = units.filter((name) => name.startsWith('vestara-') && name.endsWith('.service'));
  const targetWants = join(output, 'etc/systemd/system/vestara.target.wants');
  await mkdir(targetWants, { recursive: true });
  for (const service of services) await symlink(`../${service}`, join(targetWants, service));
  const multiUserWants = join(output, 'etc/systemd/system/multi-user.target.wants');
  await mkdir(multiUserWants, { recursive: true });
  await symlink('../vestara.target', join(multiUserWants, 'vestara.target'));
  await writeFile(
    join(output, 'etc/vestara/portable-drive.conf'),
    '# OS-1 staging configuration\nVESTARA_REPO=/var/lib/vestara/workspaces/default\n',
  );
  // The manifest describes staged payload files, not itself. Excluding the
  // manifest avoids a self-referential hash and makes reruns stable.
  const files = (await filesUnder(output)).filter((path) => path !== join(output, 'MANIFEST.json'));
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) : 0;
  if (!Number.isFinite(sourceDateEpoch) || sourceDateEpoch < 0)
    throw new Error('SOURCE_DATE_EPOCH must be a non-negative number');
  const generatedAt = new Date(sourceDateEpoch * 1000).toISOString();
  const manifest = {
    format: 'vestara-os1-portable-drive',
    version: 1,
    generatedAt,
    bootable: false,
    systemdBootEnabled: true,
    enabledServices: services,
    image: false,
    physicalDeviceWrite: false,
    layout,
    files: await Promise.all(
      files.map(async (path) => ({ path: path.slice(output.length + 1), sha256: await digest(path) })),
    ),
  };
  await writeFile(join(output, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Staged OS-1 portable-drive tree at ${output}`);
}
try {
  if (args[0] === 'plan')
    console.log(
      JSON.stringify(
        {
          format: 'vestara-os1-portable-drive',
          version: 1,
          bootable: false,
          systemdBootEnabled: true,
          image: false,
          enabledServices: ['vestara-host.service', 'vestara-api.service', 'vestara-workspace.service'],
          layout,
        },
        null,
        2,
      ),
    );
  else if (args[0] === 'stage') await stage();
  else {
    console.error('Usage: node scripts/os1-portable-drive.mjs plan | stage --output <directory> [--clean]');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
