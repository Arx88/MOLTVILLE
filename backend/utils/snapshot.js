import { promises as fs } from 'fs';
import path from 'path';

export const resolveSnapshotPath = (snapshotPath) => path.resolve(snapshotPath);

export const ensureSnapshotDirectory = async (snapshotPath) => {
  const directory = path.dirname(snapshotPath);
  await fs.mkdir(directory, { recursive: true });
};

export const saveSnapshotFile = async (snapshotPath, snapshot) => {
  await ensureSnapshotDirectory(snapshotPath);
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
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
