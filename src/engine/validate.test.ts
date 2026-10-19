import { validateSteps } from './validate';
import { QueryStep } from '../types';

function step(partial: Partial<QueryStep> & Pick<QueryStep, 'id'>): QueryStep {
  return {
    datasourceUid: '',
    datasourceType: '',
    rawSql: '',
    hide: false,
    ...partial,
  };
}

describe('validateSteps', () => {
  it('allows a new empty query', () => {
    expect(validateSteps([step({ id: 'step1' })])).toEqual([]);
  });

  it('accepts a step that passes values into IN ()', () => {
    expect(
      validateSteps([
        step({
          id: 'users',
          datasourceUid: 'mysql',
          datasourceType: 'mysql',
          rawSql: 'SELECT id FROM users WHERE active = 1',
          hide: true,
        }),
        step({
          id: 'orders',
          datasourceUid: 'postgres',
          datasourceType: 'postgres',
          rawSql: 'SELECT sku FROM orders WHERE user_id IN ({{users.id}})',
        }),
      ])
    ).toEqual([]);
  });

  it('requires a database and SQL once a step has been started', () => {
    const issues = validateSteps([
      step({ id: 'users', rawSql: 'SELECT id FROM users' }),
      step({ id: 'orders', datasourceUid: 'postgres', datasourceType: 'postgres' }),
    ]);

    expect(issues.map((issue) => issue.message)).toEqual([
      'Choose MySQL, PostgreSQL, or SQL Server.',
      'Write the SQL for this step.',
    ]);
  });

  it('rejects a bad name, a repeated name, and a placeholder that is not a list', () => {
    const issues = validateSteps([
      step({
        id: 'user-id',
        datasourceUid: 'mysql',
        datasourceType: 'mysql',
        rawSql: 'SELECT id FROM users WHERE id = {{missing.id}}',
      }),
      step({
        id: 'users',
        datasourceUid: 'mysql',
        datasourceType: 'mysql',
        rawSql: 'SELECT 1',
        hide: true,
      }),
      step({
        id: 'users',
        datasourceUid: 'postgres',
        datasourceType: 'postgres',
        rawSql: 'SELECT 1',
        hide: true,
      }),
    ]);

    expect(issues.map((issue) => issue.message)).toEqual([
      'Use letters, numbers, and underscores only, and start with a letter. Example: users.',
      'There is no step named "missing". Add that step, or fix {{missing.id}}.',
      'Write IN ({{missing.id}}). The placeholder becomes a list, such as 1, 2, 3.',
      'Another step is already named "users". Each step needs its own name.',
      'Another step is already named "users". Each step needs its own name.',
    ]);
  });

  it('names both steps when they wait on each other', () => {
    const issues = validateSteps([
      step({
        id: 'users',
        datasourceUid: 'mysql',
        datasourceType: 'mysql',
        rawSql: 'SELECT id FROM users WHERE id IN ({{orders.id}})',
      }),
      step({
        id: 'orders',
        datasourceUid: 'postgres',
        datasourceType: 'postgres',
        rawSql: 'SELECT id FROM orders WHERE user_id IN ({{users.id}})',
        hide: true,
      }),
    ]);

    expect(issues.map((issue) => issue.message)).toContain('Steps "users" and "orders" wait on each other, so neither can run first.');
  });

  it('rejects a step that reads its own column', () => {
    const issues = validateSteps([
      step({
        id: 'users',
        datasourceUid: 'mysql',
        datasourceType: 'mysql',
        rawSql: 'SELECT id FROM users WHERE id IN ({{users.id}})',
      }),
    ]);

    expect(issues.map((issue) => issue.message)).toContain(
      'This step cannot read its own column. Point {{users.id}} at a different step.'
    );
  });
});
