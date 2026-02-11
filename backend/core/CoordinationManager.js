import { randomUUID } from 'crypto';

const VALID_STATUSES = ['pending', 'in_progress', 'done', 'failed', 'cancelled'];

export class CoordinationManager {
  constructor() {
    this.proposals = new Map();
    this.maxClosed = 500;
  }

  createProposal({ title, description, category = 'community', createdBy, objective = null, expiresAt = null, requiredRoles = [] }) {
    if (!createdBy) throw new Error('createdBy is required');
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    if (!cleanTitle) throw new Error('title is required');

    const now = Date.now();
    const proposal = {
      id: `proposal_${randomUUID()}`,
      title: cleanTitle,
      description: typeof description === 'string' ? description.trim() : '',
      category,
      objective: objective && typeof objective === 'object' ? objective : null,
      status: 'pending',
      createdBy,
      createdAt: now,
      updatedAt: now,
      expiresAt: Number.isFinite(expiresAt) ? Number(expiresAt) : null,
      members: [{ agentId: createdBy, role: 'initiator', status: 'joined', joinedAt: now }],
      requiredRoles: Array.isArray(requiredRoles)
        ? requiredRoles
          .map((entry) => ({
            role: typeof entry?.role === 'string' ? entry.role.trim() : '',
            min: Number.isFinite(entry?.min) ? Math.max(1, Number(entry.min)) : 1
          }))
          .filter((entry) => entry.role)
        : [],
      commitments: [],
      history: [{ type: 'proposal_created', at: now, by: createdBy }],
      result: null
    };

    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  joinProposal(proposalId, agentId, role = 'participant') {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error('Proposal not found');
    if (['done', 'failed', 'cancelled'].includes(proposal.status)) {
      throw new Error('Proposal is closed');
    }

    const now = Date.now();
    const normalizedRole = typeof role === 'string' && role.trim() ? role.trim() : 'participant';
    const existing = proposal.members.find((member) => member.agentId === agentId);
    let joined = false;

    if (existing) {
      existing.role = normalizedRole || existing.role;
      existing.status = 'joined';
      existing.joinedAt = existing.joinedAt || now;
    } else {
      proposal.members.push({
        agentId,
        role: normalizedRole,
        status: 'joined',
        joinedAt: now
      });
      proposal.history.push({ type: 'proposal_joined', at: now, by: agentId, role: normalizedRole });
      joined = true;
    }

    proposal.updatedAt = now;
    return { proposal, joined };
  }

  commitTask(proposalId, agentId, { task, role = 'participant', dueAt = null } = {}) {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error('Proposal not found');
    if (!agentId) throw new Error('agentId is required');

    this.joinProposal(proposalId, agentId, role);

    const now = Date.now();
    const normalizedTask = typeof task === 'string' && task.trim() ? task.trim() : 'support_proposal';
    const normalizedRole = typeof role === 'string' && role.trim() ? role.trim() : 'participant';

    const existing = proposal.commitments.find((entry) =>
      entry.agentId === agentId &&
      entry.task === normalizedTask &&
      ['pending', 'in_progress'].includes(entry.status)
    );

    if (existing) {
      existing.updatedAt = now;
      return existing;
    }

    const commitment = {
      id: `commit_${randomUUID()}`,
      proposalId,
      agentId,
      task: normalizedTask,
      role: normalizedRole,
      status: 'pending',
      progress: 0,
      notes: '',
      dueAt: Number.isFinite(dueAt) ? Number(dueAt) : null,
      createdAt: now,
      updatedAt: now,
      completedAt: null
    };

    proposal.commitments.push(commitment);
    proposal.updatedAt = now;
    proposal.status = proposal.status === 'pending' ? 'in_progress' : proposal.status;
    proposal.history.push({ type: 'commitment_created', at: now, by: agentId, commitmentId: commitment.id });

    return commitment;
  }

  updateCommitment(proposalId, commitmentId, { status, progress, notes, by }) {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error('Proposal not found');
    const commitment = proposal.commitments.find((entry) => entry.id === commitmentId);
    if (!commitment) throw new Error('Commitment not found');

    const now = Date.now();
    if (typeof status === 'string') {
      const normalized = status.trim().toLowerCase();
      if (!VALID_STATUSES.includes(normalized)) {
        throw new Error('Invalid status');
      }
      commitment.status = normalized;
      if (normalized === 'done') commitment.completedAt = now;
    }
    if (Number.isFinite(progress)) commitment.progress = Math.max(0, Math.min(100, Number(progress)));
    if (typeof notes === 'string') commitment.notes = notes.trim().slice(0, 500);
    commitment.updatedAt = now;

    this._recomputeProposalStatus(proposal);
    proposal.updatedAt = now;
    proposal.history.push({ type: 'commitment_updated', at: now, by: by || commitment.agentId, commitmentId });

    return commitment;
  }

  setProposalStatus(proposalId, status, { by, summary = '' } = {}) {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error('Proposal not found');
    const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
    if (!VALID_STATUSES.includes(normalized)) throw new Error('Invalid status');

    const now = Date.now();
    proposal.status = normalized;
    proposal.updatedAt = now;
    if (['done', 'failed', 'cancelled'].includes(normalized)) {
      proposal.result = {
        closedAt: now,
        by: by || null,
        summary: typeof summary === 'string' ? summary.trim().slice(0, 700) : ''
      };
    }
    proposal.history.push({ type: 'proposal_status', at: now, by: by || null, status: normalized });
    this._gcClosed();
    return proposal;
  }

  listProposals({ status = null, agentId = null, limit = 50 } = {}) {
    let items = Array.from(this.proposals.values());
    if (status) items = items.filter((item) => item.status === status);
    if (agentId) {
      items = items.filter((item) =>
        item.createdBy === agentId ||
        item.members.some((member) => member.agentId === agentId) ||
        item.commitments.some((commit) => commit.agentId === agentId)
      );
    }
    items.sort((a, b) => b.updatedAt - a.updatedAt);
    return items.slice(0, Math.max(1, limit));
  }

  getProposal(proposalId) {
    return this.proposals.get(proposalId) || null;
  }

  createSnapshot() {
    return {
      proposals: Array.from(this.proposals.values())
    };
  }

  loadSnapshot(snapshot) {
    this.proposals = new Map();
    if (!snapshot || !Array.isArray(snapshot.proposals)) return;
    snapshot.proposals.forEach((proposal) => {
      if (!proposal?.id) return;
      this.proposals.set(proposal.id, proposal);
    });
    this._gcClosed();
  }

  _recomputeProposalStatus(proposal) {
    if (!proposal.commitments.length) {
      proposal.status = 'pending';
      return;
    }
    const statuses = proposal.commitments.map((commitment) => commitment.status);
    if (statuses.every((status) => status === 'done')) {
      proposal.status = 'done';
      return;
    }
    if (statuses.some((status) => status === 'failed')) {
      proposal.status = 'failed';
      return;
    }
    proposal.status = 'in_progress';
  }

  _gcClosed() {
    const closed = Array.from(this.proposals.values())
      .filter((proposal) => ['done', 'failed', 'cancelled'].includes(proposal.status))
      .sort((a, b) => (b.result?.closedAt || b.updatedAt) - (a.result?.closedAt || a.updatedAt));
    const toDelete = closed.slice(this.maxClosed);
    toDelete.forEach((proposal) => this.proposals.delete(proposal.id));
  }
}
