import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export const resolveSnapshotPath = (snapshotPath) => path.resolve(snapshotPath);

export const ensureSnapshotDirectory = async (snapshotPath) => {
  const directory = path.dirname(snapshotPath);
  await fs.mkdir(directory, { recursive: true });
};

const formatSnapshotTimestamp = (timestamp) => {
  const iso = new Date(timestamp).toISOString();
  return iso.replace(/[:.]/g, '-');
};

const computeChecksum = (payload) => crypto.createHash('sha256').update(payload).digest('hex');

const writeSnapshotArchive = async (archiveDir, snapshotPath, payload, { checksum = true } = {}) => {
  const baseName = path.basename(snapshotPath, path.extname(snapshotPath));
  const timestamp = formatSnapshotTimestamp(Date.now());
  const archiveName = `${baseName}-${timestamp}.json`;
  const archivePath = path.join(archiveDir, archiveName);
  await fs.mkdir(archiveDir, { recursive: true });
  await fs.writeFile(archivePath, payload, 'utf-8');
  if (checksum) {
    const digest = computeChecksum(payload);
    await fs.writeFile(`${archivePath}.sha256`, `${digest}  ${archiveName}\n`, 'utf-8');
  }
  return archivePath;
};

const pruneSnapshotArchives = async (archiveDir, snapshotPath, retention) => {
  if (!retention || retention < 1) return;
  const baseName = path.basename(snapshotPath, path.extname(snapshotPath));
  const entries = await fs.readdir(archiveDir, { withFileTypes: true });
  const snapshotFiles = entries
    .filter(entry => entry.isFile() && entry.name.startsWith(`${baseName}-`) && entry.name.endsWith('.json'))
    .map(entry => entry.name);
  if (snapshotFiles.length <= retention) return;
  const stats = await Promise.all(
    snapshotFiles.map(async name => ({
      name,
      stats: await fs.stat(path.join(archiveDir, name))
    }))
  );
  stats.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
  const toDelete = stats.slice(retention);
  await Promise.all(
    toDelete.flatMap(entry => {
      const target = path.join(archiveDir, entry.name);
      const checksumFile = `${target}.sha256`;
      return [
        fs.unlink(target).catch(() => {}),
        fs.unlink(checksumFile).catch(() => {})
      ];
    })
  );
};

export const saveSnapshotFile = async (snapshotPath, snapshot, options = {}) => {
  await ensureSnapshotDirectory(snapshotPath);
  const payload = JSON.stringify(snapshot, null, 2);
  await fs.writeFile(snapshotPath, payload, 'utf-8');
  if (options.archiveDir) {
    await writeSnapshotArchive(options.archiveDir, snapshotPath, payload, {
      checksum: options.checksum !== false
    });
    await pruneSnapshotArchives(options.archiveDir, snapshotPath, options.retention);
  }
};

export const loadSnapshotFile = async (snapshotPath) => {
  const raw = await fs.readFile(snapshotPath, 'utf-8');
  return JSON.parse(raw);
};

export const getSnapshotStats = async (snapshotPath) => {
  const stats = await fs.stat(snapshotPath);
  return {
    size: stats.size,
    modifiedAt: stats.mtimeMs
  };
};
