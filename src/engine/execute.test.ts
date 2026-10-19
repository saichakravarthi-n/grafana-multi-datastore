import { createDataFrame, DataFrame, FieldType } from '@grafana/data';

import { executeSteps } from './execute';
import { QueryStep } from '../types';

function step(partial: Partial<QueryStep> & Pick<QueryStep, 'id' | 'rawSql'>): QueryStep {
  return {
    datasourceUid: 'mysql-uid',
    datasourceType: 'mysql',
    hide: false,
    ...partial,
  };
}

function idsFrame(ids: Array<number | null>): DataFrame {
  return createDataFrame({
    refId: 'A',
    fields: [{ name: 'id', type: FieldType.number, values: ids }],
  });
}

describe('executeSteps', () => {
  it('runs the source step first and fills the IN list before the next query', async () => {
    const calls: string[] = [];
    const frames = await executeSteps({
      panelRefId: 'A',
      maxListSize: 1000,
      steps: [
        step({ id: 'users', rawSql: 'SELECT id FROM users WHERE active = 1', hide: true }),
        step({
          id: 'orders',
          datasourceUid: 'pg-uid',
          datasourceType: 'postgres',
          rawSql: 'SELECT * FROM orders WHERE user_id IN ({{users.id}})',
        }),
      ],
      runQuery: async (current, rawSql) => {
        calls.push(`${current.id}:${rawSql}`);
        if (current.id === 'users') {
          return [idsFrame([1, 2, 2])];
        }
        return [createDataFrame({ fields: [{ name: 'sku', type: FieldType.string, values: ['book', 'pen'] }] })];
      },
    });

    expect(calls).toEqual([
      'users:SELECT id FROM users WHERE active = 1',
      'orders:SELECT * FROM orders WHERE user_id IN (1, 2)',
    ]);
    expect(frames).toHaveLength(1);
    expect(frames[0].refId).toBe('A');
    expect(frames[0].fields[0].values).toEqual(['book', 'pen']);
  });

  it('runs independent steps before the step that needs both', async () => {
    const started: string[] = [];
    await executeSteps({
      panelRefId: 'A',
      maxListSize: 1000,
      steps: [
        step({ id: 'users', rawSql: 'SELECT id FROM users', hide: true }),
        step({ id: 'regions', rawSql: 'SELECT id FROM regions', hide: true, datasourceType: 'postgres' }),
        step({
          id: 'orders',
          rawSql: 'SELECT 1 WHERE user_id IN ({{users.id}}) AND region_id IN ({{regions.id}})',
        }),
      ],
      runQuery: async (current) => {
        started.push(current.id);
        return [idsFrame([1])];
      },
    });

    expect(started.slice(0, 2).sort()).toEqual(['regions', 'users']);
    expect(started[2]).toBe('orders');
  });

  it('uses separate ref ids when more than one step is shown', async () => {
    const frames = await executeSteps({
      panelRefId: 'A',
      maxListSize: 1000,
      steps: [
        step({ id: 'users', rawSql: 'SELECT id FROM users' }),
        step({ id: 'orders', rawSql: 'SELECT id FROM orders WHERE user_id IN ({{users.id}})' }),
      ],
      runQuery: async (current) => [idsFrame(current.id === 'users' ? [1] : [10])],
    });

    expect(frames.map((frame) => frame.refId)).toEqual(['A_users', 'A_orders']);
  });

  it('stops on a cycle before running a query', async () => {
    const runQuery = jest.fn();
    await expect(
      executeSteps({
        panelRefId: 'A',
        maxListSize: 1000,
        steps: [
          step({ id: 'users', rawSql: 'SELECT id FROM users WHERE id IN ({{orders.id}})' }),
          step({ id: 'orders', rawSql: 'SELECT id FROM orders WHERE user_id IN ({{users.id}})' }),
        ],
        runQuery,
      })
    ).rejects.toThrow('Steps "users" and "orders" depend on each other.');
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('stops when the value list is over the cap', async () => {
    await expect(
      executeSteps({
        panelRefId: 'A',
        maxListSize: 1,
        steps: [
          step({ id: 'users', rawSql: 'SELECT id FROM users', hide: true }),
          step({ id: 'orders', rawSql: 'SELECT id FROM orders WHERE user_id IN ({{users.id}})' }),
        ],
        runQuery: async (current) => [idsFrame(current.id === 'users' ? [1, 2] : [])],
      })
    ).rejects.toThrow('over the limit of 1');
  });

  it('does not run a hidden step that nothing shows or reads', async () => {
    const calls: string[] = [];
    await executeSteps({
      panelRefId: 'A',
      maxListSize: 1000,
      steps: [
        step({ id: 'users', rawSql: 'SELECT id FROM users' }),
        step({ id: 'unused', rawSql: 'SELECT 1', hide: true }),
      ],
      runQuery: async (current) => {
        calls.push(current.id);
        return [idsFrame([1])];
      },
    });
    expect(calls).toEqual(['users']);
  });
});
