import { planRunOrder } from './planRunOrder';
import { QueryStep } from '../types';

function step(partial: Partial<QueryStep> & Pick<QueryStep, 'id' | 'rawSql'>): QueryStep {
  return {
    datasourceUid: 'db',
    datasourceType: 'mysql',
    hide: false,
    ...partial,
  };
}

describe('planRunOrder', () => {
  it('puts the database with no dependency first', () => {
    const plan = planRunOrder([
      step({
        id: 'orders',
        datasourceType: 'postgres',
        rawSql: 'SELECT sku FROM orders WHERE user_id IN ({{users.id}})',
      }),
      step({ id: 'users', rawSql: 'SELECT id FROM users' }),
    ]);

    expect(plan).toEqual([
      { id: 'orders', wave: 2, dependsOn: ['users'], missing: [], datasourceType: 'postgres' },
      { id: 'users', wave: 1, dependsOn: [], missing: [], datasourceType: 'mysql' },
    ]);
  });

  it('runs independent databases in the same first wave', () => {
    const plan = planRunOrder([
      step({ id: 'users', rawSql: 'SELECT id FROM users' }),
      step({ id: 'regions', datasourceType: 'postgres', rawSql: 'SELECT id FROM regions' }),
    ]);

    expect(plan?.map((item) => item.wave)).toEqual([1, 1]);
  });

  it('does not claim a step runs first when its dependency is missing', () => {
    const plan = planRunOrder([step({ id: 'orders', rawSql: 'SELECT 1 WHERE id IN ({{users.id}})' })]);
    expect(plan?.[0].wave).toBeUndefined();
    expect(plan?.[0].missing).toEqual(['users']);
  });

  it('returns nothing when the steps wait on each other', () => {
    expect(
      planRunOrder([
        step({ id: 'users', rawSql: 'SELECT id FROM users WHERE id IN ({{orders.id}})' }),
        step({ id: 'orders', rawSql: 'SELECT id FROM orders WHERE user_id IN ({{users.id}})' }),
      ])
    ).toBeUndefined();
  });
});
