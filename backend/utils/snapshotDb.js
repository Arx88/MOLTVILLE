export const saveSnapshotDb = async (db, snapshot) => {
  if (!db) return null;
  const result = await db.query(
    'INSERT INTO world_snapshots (snapshot) VALUES ($1) RETURNING id, created_at',
    [snapshot]
  );
  return result.rows[0] || null;
};

export const loadLatestSnapshotDb = async (db) => {
  if (!db) {
    const error = new Error('Database not configured');
    error.code = 'ENOENT';
    throw error;
  }
  const result = await db.query(
    'SELECT snapshot FROM world_snapshots ORDER BY created_at DESC LIMIT 1'
  );
  if (!result.rows.length) {
    const error = new Error('No snapshot found');
    error.code = 'ENOENT';
    throw error;
  }
  return result.rows[0].snapshot;
};
