export class CommitmentManager {
  constructor() {
    this.commitments = new Map();
    this.byAgent = new Map();
  }

  declare({ agentId, counterpartId = null, text, source = 'dialog', semantic = {}, dueAt = null }) {
    if (!agentId || !text) throw new Error('agentId and text are required');
    const id = `commit_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const item = {
      id,
      agentId,
      counterpartId,
      text: String(text).trim(),
      source,
      semantic,
      status: 'declared',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dueAt: dueAt ? Number(dueAt) : null,
      result: null
    };
    this.commitments.set(id, item);
    if (!this.byAgent.has(agentId)) this.byAgent.set(agentId, new Set());
    this.byAgent.get(agentId).add(id);
    return item;
  }

  update({ commitmentId, status, progress, result = null }) {
    const current = this.commitments.get(commitmentId);
    if (!current) throw new Error('Commitment not found');
    if (status) current.status = status;
    if (Number.isFinite(progress)) current.progress = Math.max(0, Math.min(100, Number(progress)));
    if (result !== null) current.result = result;
    current.updatedAt = Date.now();
    return current;
  }

  mine(agentId) {
    const ids = Array.from(this.byAgent.get(agentId) || []);
    return ids.map((id) => this.commitments.get(id)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  }

  stats() {
    const all = Array.from(this.commitments.values());
    const created = all.length;
    const completed = all.filter((c) => c.status === 'completed' || c.status === 'done').length;
    const expired = all.filter((c) => c.dueAt && c.dueAt < Date.now() && !['completed', 'done', 'failed', 'expired'].includes(c.status)).length;
    return { created, completed, expired };
  }

  createSnapshot() {
    return {
      commitments: Array.from(this.commitments.entries()),
      byAgent: Array.from(this.byAgent.entries()).map(([agentId, ids]) => [agentId, Array.from(ids)])
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;
    this.commitments = new Map(snapshot.commitments || []);
    this.byAgent = new Map((snapshot.byAgent || []).map(([agentId, ids]) => [agentId, new Set(ids || [])]));
  }
}
