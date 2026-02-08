import { withDb } from '../utils/db.js';
import { logger } from '../utils/logger.js';

const schema = `
CREATE TABLE IF NOT EXISTS economy_balances (
  agent_id TEXT PRIMARY KEY,
  balance NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  api_key TEXT PRIMARY KEY,
  agent_id TEXT,
  issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_key_events (
  id SERIAL PRIMARY KEY,
  api_key TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_type TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economy_transactions (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economy_properties (
  property_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  building_id TEXT NOT NULL,
  price NUMERIC NOT NULL,
  owner_id TEXT,
  for_sale BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economy_inventories (
  agent_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, item_id)
);

CREATE TABLE IF NOT EXISTS economy_job_assignments (
  agent_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economy_reviews (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  score NUMERIC NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vote_state (
  vote_id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL,
  options JSONB NOT NULL,
  votes JSONB NOT NULL,
  voters JSONB NOT NULL,
  starts_at BIGINT NOT NULL,
  ends_at BIGINT NOT NULL,
  status TEXT NOT NULL,
  winner JSONB
);

CREATE TABLE IF NOT EXISTS vote_proposals (
  proposal_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  template_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  district_id TEXT,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  used_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS governance_elections (
  election_id TEXT PRIMARY KEY,
  candidates JSONB NOT NULL,
  votes JSONB NOT NULL,
  voters JSONB NOT NULL,
  starts_at BIGINT NOT NULL,
  ends_at BIGINT NOT NULL,
  status TEXT NOT NULL,
  winner JSONB
);

CREATE TABLE IF NOT EXISTS governance_president (
  id INTEGER PRIMARY KEY DEFAULT 1,
  president JSONB,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS governance_policies (
  policy_id TEXT PRIMARY KEY,
  policy JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_relationships (
  agent_id TEXT NOT NULL,
  other_agent_id TEXT NOT NULL,
  affinity INTEGER NOT NULL DEFAULT 0,
  trust INTEGER NOT NULL DEFAULT 0,
  respect INTEGER NOT NULL DEFAULT 0,
  conflict INTEGER NOT NULL DEFAULT 0,
  interactions INTEGER NOT NULL DEFAULT 0,
  last_interaction BIGINT,
  PRIMARY KEY (agent_id, other_agent_id)
);

CREATE TABLE IF NOT EXISTS agent_permissions (
  agent_id TEXT PRIMARY KEY,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  timestamp BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_sessions (
  conversation_id TEXT PRIMARY KEY,
  initiator_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  last_activity BIGINT NOT NULL,
  ended_at BIGINT,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id SERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp BIGINT NOT NULL
);
`;

async function main() {
  await withDb(async (db) => {
    await db.query(schema);
    logger.info('Database schema initialized.');
  });
}

main().catch((error) => {
  logger.error('Failed to initialize database:', error);
  process.exit(1);
});
