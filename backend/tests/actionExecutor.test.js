import test from 'node:test';
import assert from 'node:assert/strict';

import { ActionExecutor } from '../core/ActionExecutor.js';

const buildExecutor = () => {
  const calls = {
    moved: [],
    speech: []
  };

  const executor = new ActionExecutor({
    worldState: {
      buildings: [],
      moveAgentTo(agentId, x, y) {
        calls.moved.push({ agentId, x, y });
        return { success: true, target: { x, y } };
      },
      getAgentPosition() {
        return { x: 1, y: 1 };
      }
    },
    registry: {
      getAgent(agentId) {
        if (agentId === 'agent-1') return { id: 'agent-1', name: 'Agent One' };
        if (agentId === 'agent-2') return { id: 'agent-2', name: 'Agent Two' };
        return null;
      }
    },
    interactionEngine: {
      async performSocialAction() {
        return { ok: true };
      }
    },
    economyManager: {
      applyForJob() {
        return { status: 'pending' };
      },
      voteForJob() {
        return { status: 'pending' };
      }
    },
    negotiationService: {
      propose() {
        return { id: 'neg-1', status: 'proposed' };
      },
      counter() {
        return { id: 'neg-1', status: 'countered' };
      },
      accept() {
        return { id: 'neg-1', status: 'accepted' };
      }
    },
    commitmentManager: {
      declare() {
        return { id: 'commit-1', status: 'declared' };
      }
    },
    favorLedger: {
      createFavor() {
        return { id: 'favor-1', from: 'agent-1', to: 'agent-2', value: 1 };
      },
      repayFavor() {
        return { success: true };
      }
    },
    reputationManager: {
      adjust() {}
    },
    actionQueue: {
      async enqueue() {}
    },
    io: {
      emit(event, payload) {
        calls.speech.push({ event, payload });
      }
    },
    logger: {
      info() {},
      warn() {},
      error() {}
    }
  });

  return { executor, calls };
};

test('ActionExecutor executes movement actions', async () => {
  const { executor, calls } = buildExecutor();

  const result = await executor.execute({
    agentId: 'agent-1',
    decision: {
      goal: 'Moverse',
      thought: 'Debo acercarme',
      action: {
        type: 'move_to_position',
        params: { x: 4, y: 9 }
      },
      utterance: '',
      nextThinkMs: 8000
    },
    traceId: 'trace-1'
  });

  assert.equal(result.status, 'ok');
  assert.equal(calls.moved.length, 1);
  assert.deepEqual(calls.moved[0], { agentId: 'agent-1', x: 4, y: 9 });
});

test('ActionExecutor rejects unknown action type', async () => {
  const { executor } = buildExecutor();

  await assert.rejects(
    () => executor.execute({
      agentId: 'agent-1',
      decision: {
        goal: 'Invalid',
        thought: 'Invalid',
        action: { type: 'unknown_action', params: {} },
        utterance: '',
        nextThinkMs: 8000
      },
      traceId: 'trace-2'
    }),
    /unknown_action_type/
  );
});
