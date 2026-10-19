import { validateSteps } from '../../src/engine/validate';
import { QueryStep } from '../../src/types';

jest.mock('../../src/engine/order', () => ({
  executionWaves: () => {
    throw 'not a cycle';
  },
}));

function step(id: string): QueryStep {
  return { id, datasourceUid: 'mysql', datasourceType: 'mysql', rawSql: 'SELECT 1', hide: false };
}

describe('validateSteps when ordering fails for another reason', () => {
  it('leaves the query runnable when the failure is not a cycle', () => {
    const messages = validateSteps([step('users')]).map((issue) => issue.message);
    expect(messages.join(' ')).not.toContain('cycle');
  });
});
