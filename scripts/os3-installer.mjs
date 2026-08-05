#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  const value = i >= 0 ? args[i + 1] : undefined;
  if (!value || value.startsWith('/dev/') || value === '/' || value.startsWith('\\\\.\\'))
    throw new Error(`${name} must be a new regular directory path, not a device or filesystem root`);
  return resolve(value);
};
const hash = (data) => createHash('sha256').update(data).digest('hex');
async function install() {
  const image = arg('--image');
  const target = arg('--target');
  const archive = await readFile(image);
  const metadata = JSON.parse(await readFile(`${image}.json`, 'utf8'));
  if (metadata.format !== 'vestara-os2-portable-drive-image' || metadata.physicalDeviceWrite !== false)
    throw new Error('invalid OS-2 image metadata');
  if (hash(archive) !== metadata.archiveSha256) throw new Error('OS-2 archive hash mismatch');
  const temporary = `${target}.os3-staging-${process.pid}`;
  await mkdir(temporary, { recursive: false });
  try {
    await run('tar', [
      '--extract',
      '--file',
      image,
      '--strip-components=1',
      '--no-same-owner',
      '--no-same-permissions',
      '-C',
      temporary,
    ]);
    const receipt = {
      format: 'vestara-os3-installation-receipt',
      version: 1,
      installedAt: metadata.generatedAt,
      sourceImageSha256: hash(archive),
      target: target,
      bootable: false,
      systemdBootEnabled: true,
      bootloaderInstalled: false,
      partitioned: false,
      physicalDeviceWrite: false,
    };
    await writeFile(join(temporary, 'etc/vestara/os3-installation.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    await rename(temporary, target);
    await writeFile(`${target}.json`, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`Installed OS-3 filesystem tree at ${target}`);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
try {
  if (args[0] === 'plan')
    console.log(
      JSON.stringify(
        {
          format: 'vestara-os3-installation',
          version: 1,
          target: 'new-directory',
          bootable: false,
          systemdBootEnabled: true,
          bootloaderInstalled: false,
          partitioned: false,
          physicalDeviceWrite: false,
        },
        null,
        2,
      ),
    );
  else if (args[0] === 'install') await install();
  else
    throw new Error('Usage: node scripts/os3-installer.mjs plan | install --image <os2.tar> --target <new-directory>');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
