import { createDataFrame, DataFrame, FieldType } from '@grafana/data';

import { hasDependency, insertDependency, replaceDependency, removeDependency } from '../../src/engine/dependsOn';
import { executeSteps } from '../../src/engine/execute';
import { dialectForType, interpolateSql } from '../../src/engine/interpolate';
import { findCycle } from '../../src/engine/order';
import { databaseName, planRunOrder } from '../../src/engine/planRunOrder';
import { issuesFor, queryIssues, validateSteps } from '../../src/engine/validate';
import { QueryStep } from '../../src/types';
import { MagicMock } from './magicMock';

function step(partial: Partial<QueryStep> & Pick<QueryStep, 'id'>): QueryStep {
  return {
    datasourceUid: 'mysql',
    datasourceType: 'mysql',
    rawSql: 'SELECT 1',
    hide: false,
    ...partial,
  };
}

describe('dependency edits that were not covered yet', () => {
  it('detects a placeholder and leaves SQL alone when the dependency does not change', () => {
    const sql = 'WHERE id IN ({{users.id}})';
    expect(hasDependency(sql, { stepId: 'users', column: 'id' })).toBe(true);
    expect(replaceDependency(sql, { stepId: 'users', column: 'id' }, { stepId: 'users', column: 'id' })).toBe(sql);
  });

  it('drops the old placeholder when the new one is already in the query', () => {
    expect(
      replaceDependency('WHERE id IN ({{users.id}}) AND code IN ({{regions.code}})', { stepId: 'users', column: 'id' }, { stepId: 'regions', column: 'code' })
    ).toBe('WHERE code IN ({{regions.code}})');
  });

  it('collapses extra blank lines left after a placeholder is removed', () => {
    expect(removeDependency('SELECT 1\n\n\nWHERE id IN ({{users.id}})   \n', { stepId: 'users', column: 'id' })).toBe('SELECT 1');
  });

  it('inserts into SQL that only has trailing spaces', () => {
    expect(insertDependency('   ', { stepId: 'users', column: 'id' })).toBe('WHERE id IN ({{users.id}})');
  });
});

describe('planRunOrder names', () => {
  it('returns nothing when a name is invalid or repeated', () => {
    expect(planRunOrder([step({ id: 'bad-name' })])).toBeUndefined();
    expect(planRunOrder([step({ id: 'users' }), step({ id: 'users', hide: true })])).toBeUndefined();
  });

  it('names each supported database', () => {
    expect(databaseName('mysql')).toBe('MySQL');
    expect(databaseName('postgres')).toBe('PostgreSQL');
    expect(databaseName('grafana-postgresql-datasource')).toBe('PostgreSQL');
    expect(databaseName('mssql')).toBe('SQL Server');
    expect(databaseName('grafana-mssql-datasource')).toBe('SQL Server');
    expect(databaseName(undefined)).toBe('this database');
    expect(databaseName('prometheus')).toBe('this database');
  });
});

describe('interpolateSql remaining values', () => {
  it('maps each SQL plugin id to a dialect', () => {
    expect(dialectForType(undefined)).toBeUndefined();
    expect(dialectForType('prometheus')).toBeUndefined();
    expect(dialectForType('grafana-postgresql-datasource')).toBe('postgres');
    expect(dialectForType('mssql')).toBe('mssql');
    expect(dialectForType('grafana-mssql-datasource')).toBe('mssql');
    expect(() =>
      interpolateSql('IN ({{users.id}})', {
        framesByStep: new Map(),
        dialect: 'mysql',
        maxListSize: 10,
        consumerStepId: 'orders',
      })
    ).toThrow('did not return it');
    expect(() =>
      interpolateSql('IN ({{users.id}})', {
        framesByStep: new Map([['users', [{ fields: undefined, length: 0 } as unknown as DataFrame]]]),
        dialect: 'mysql',
        maxListSize: 10,
        consumerStepId: 'orders',
      })
    ).toThrow('did not return it');
    expect(findCycle(new Map([['users', new Set<string>()]]))).toEqual(['users']);
  });

  it('reuses one list when the same placeholder appears twice', () => {
    const framesByStep = new Map([
      ['users', [createDataFrame({ fields: [{ name: 'ID', type: FieldType.number, values: [7] }] })]],
    ]);
    expect(
      interpolateSql('SELECT {{users.id}}, {{ users.id }}', {
        framesByStep,
        dialect: 'mysql',
        maxListSize: 10,
        consumerStepId: 'orders',
      })
    ).toBe('SELECT 7, 7');
  });

  it('reads vector values, booleans, dates, and rejects values that are not SQL', () => {
    const framesByStep = new Map<string, DataFrame[]>([
      [
        'users',
        [
          {
            fields: [
              { name: 'id', type: FieldType.number, values: { length: 2, get: () => 1, toArray: () => [1, 1] } },
              { name: 'flag', type: FieldType.boolean, values: { length: 3, get: (index: number) => [1, 'true', 'no'][index] } },
              { name: 'created', type: FieldType.time, values: [new Date('2024-01-02T03:04:05Z')] },
              { name: 'label', type: FieldType.string, values: ['Ada'] },
              { name: 'note', type: undefined, values: ['plain'] },
            ],
            length: 1,
          } as unknown as DataFrame,
        ],
      ],
    ]);
    const base = { framesByStep, maxListSize: 10, consumerStepId: 'orders' as const };

    expect(interpolateSql('IN ({{users.id}})', { ...base, dialect: 'mysql' })).toBe('IN (1)');
    expect(interpolateSql('IN ({{users.flag}})', { ...base, dialect: 'postgres' })).toBe('IN (TRUE, FALSE)');
    expect(interpolateSql('IN ({{users.flag}})', { ...base, dialect: 'mssql' })).toBe('IN (1, 0)');
    expect(interpolateSql('IN ({{users.created}})', { ...base, dialect: 'mysql' })).toBe("IN ('2024-01-02 03:04:05')");
    expect(interpolateSql('IN ({{users.label}})', { ...base, dialect: 'postgres' })).toBe("IN ('Ada')");
    expect(interpolateSql('IN ({{users.note}})', { ...base, dialect: 'mysql' })).toBe("IN ('plain')");
  });

  it('rejects an empty vector, a bad time, a bad number, and a value with no SQL form', () => {
    const reject = (values: unknown, type: FieldType | undefined, column = 'id') =>
      interpolateSql(`IN ({{users.${column}}})`, {
        framesByStep: new Map([
          ['users', [{ fields: [{ name: column, type, values }], length: 0 } as unknown as DataFrame]],
        ]),
        dialect: 'mysql',
        maxListSize: 10,
        consumerStepId: 'orders',
      });

    expect(reject({ length: 0, get: () => undefined }, FieldType.number)).toBe('IN (NULL)');
    expect(reject({}, FieldType.number)).toBe('IN (NULL)');
    expect(() => reject(['not-a-date'], FieldType.time)).toThrow('time value could not be formatted');
    expect(() => reject([Number.NaN], FieldType.number)).toThrow('not a finite number');
    expect(() => reject(['x'], FieldType.number)).toThrow('not a finite number');
    expect(() => reject([{}], undefined, 'blob')).toThrow('cannot be written as SQL');
    expect(() =>
      interpolateSql('IN ({{users.id}})', {
        framesByStep: new Map([
          [
            'users',
            [{ fields: [{ name: 'ID', type: FieldType.number, values: [1] }, { name: 'Id', type: FieldType.number, values: [2] }], length: 1 } as DataFrame],
          ],
        ]),
        dialect: 'mysql',
        maxListSize: 10,
        consumerStepId: 'orders',
      })
    ).toThrow('did not return it');
  });
});

describe('executeSteps failures', () => {
  it('requires a visible step, a name, SQL, and a supported database', async () => {
    const runQuery = new MagicMock();
    await expect(executeSteps({ steps: [step({ id: 'users', hide: true })], maxListSize: 10, panelRefId: 'A', runQuery: runQuery.fn })).rejects.toThrow(
      'Choose at least one step to show'
    );
    await expect(executeSteps({ steps: [step({ id: '  ' })], maxListSize: 10, panelRefId: 'A', runQuery: runQuery.fn })).rejects.toThrow(
      'Every step needs an id.'
    );
    await expect(executeSteps({ steps: [step({ id: 'bad-name' })], maxListSize: 10, panelRefId: 'A', runQuery: runQuery.fn })).rejects.toThrow(
      'must start with a letter'
    );
    await expect(
      executeSteps({
        steps: [step({ id: 'users' }), step({ id: 'users' })],
        maxListSize: 10,
        panelRefId: 'A',
        runQuery: runQuery.fn,
      })
    ).rejects.toThrow('used more than once');
    await expect(executeSteps({ steps: [step({ id: 'users', rawSql: '   ' })], maxListSize: 10, panelRefId: 'A', runQuery: runQuery.fn })).rejects.toThrow(
      'needs a SQL query'
    );
    await expect(
      executeSteps({ steps: [step({ id: 'users', datasourceUid: '' })], maxListSize: 10, panelRefId: 'A', runQuery: runQuery.fn })
    ).rejects.toThrow('needs a MySQL');
    await expect(
      executeSteps({ steps: [step({ id: 'users', datasourceType: 'prometheus' })], maxListSize: 10, panelRefId: 'A', runQuery: runQuery.fn })
    ).rejects.toThrow('not a supported SQL data source');
    await expect(
      executeSteps({ steps: [step({ id: 'users', datasourceType: '' })], maxListSize: 10, panelRefId: 'A', runQuery: runQuery.fn })
    ).rejects.toThrow('unknown');
    runQuery.assertNotCalled();
  });

  it('names a bad placeholder, a missing step, and a query that throws a string', async () => {
    const runQuery = new MagicMock();
    await expect(
      executeSteps({ steps: [step({ id: 'users', rawSql: 'SELECT {{nope}}' })], maxListSize: 10, panelRefId: 'A', runQuery: runQuery.fn })
    ).rejects.toThrow('Invalid placeholder');
    await expect(
      executeSteps({
        steps: [step({ id: 'orders', rawSql: 'SELECT 1 WHERE id IN ({{users.id}})' })],
        maxListSize: 10,
        panelRefId: 'A',
        runQuery: runQuery.fn,
      })
    ).rejects.toThrow('no step named "users"');

    await expect(
      executeSteps({
        steps: [step({ id: 'users' })],
        maxListSize: 10,
        panelRefId: 'A',
        runQuery: () => Promise.reject('offline'),
      })
    ).rejects.toThrow('Step "users" failed: offline');
  });

  it('reads a step once when two placeholders use it', async () => {
    const runQuery = new MagicMock<[QueryStep, string], Promise<DataFrame[]>>();
    runQuery.mockImplementation(async (current) => [
      createDataFrame({
        fields: [
          { name: 'id', type: FieldType.number, values: current.id === 'users' ? [1] : [9] },
          { name: 'name', type: FieldType.string, values: ['Ada'] },
        ],
      }),
    ]);

    await executeSteps({
      steps: [
        step({ id: 'users', hide: true, rawSql: 'SELECT id, name FROM users' }),
        step({ id: 'orders', rawSql: 'SELECT 1 WHERE id IN ({{users.id}}) AND name IN ({{users.name}})' }),
      ],
      maxListSize: 10,
      panelRefId: 'A',
      runQuery: runQuery.fn,
    });

    expect(runQuery.callCount).toBe(2);
  });

  it('keeps a query string the database already recorded and fills length from the column', async () => {
    const frames = await executeSteps({
      steps: [step({ id: 'users' })],
      maxListSize: 10,
      panelRefId: 'A',
      runQuery: async () => [
        { fields: [{ name: 'id', type: FieldType.number, values: [1, 2] }], meta: { executedQueryString: 'SELECT id' } } as DataFrame,
        { fields: [{}] } as DataFrame,
      ],
    });

    expect(frames[0].meta?.executedQueryString).toBe('SELECT id');
    expect(frames[0].length).toBe(2);
    expect(frames[1].length).toBe(0);
    expect(frames[1].meta?.executedQueryString).toBe('SELECT 1');
  });
});

describe('validateSteps remaining messages', () => {
  it('asks for a name when a started query has a blank step, and ignores a hidden blank step', () => {
    const named = step({ id: 'users' });
    const blankVisible = step({ id: ' ', rawSql: '', datasourceUid: '', hide: false });
    const blankHidden = step({ id: '', rawSql: '', datasourceUid: '', hide: true });

    expect(validateSteps([named, blankVisible]).map((issue) => issue.message)).toContain('Give this step a name, such as users.');
    expect(validateSteps([blankHidden]).map((issue) => issue.message)).not.toContain('Give this step a name, such as users.');
  });

  it('rejects an unsupported database and a step that is read but has no SQL', () => {
    const issues = validateSteps([
      step({ id: 'users', rawSql: '', datasourceUid: 'mysql', datasourceType: 'prometheus' }),
      step({ id: 'orders', rawSql: 'SELECT 1 WHERE id IN ({{users.id}})', hide: true }),
    ]);

    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'This plugin only runs MySQL, PostgreSQL, and SQL Server.',
        'Another step reads this one, so it needs a SQL query.',
      ])
    );
    expect(
      validateSteps([
        step({ id: 'users', hide: true }),
        step({ id: 'orders', rawSql: 'SELECT 1', hide: true }),
      ]).map((issue) => issue.message)
    ).toContain('Turn on “Show these rows in the panel” for the step you want the table to display.');
  });

  it('joins field messages and returns query messages on their own', () => {
    const issues = validateSteps([
      step({ id: 'orders', rawSql: 'SELECT {{bad}} WHERE id = {{missing.id}}' }),
    ]);
    expect(issuesFor(issues, 0, 'sql')).toContain('is not valid');
    expect(issuesFor(issues, 0, 'id')).toBeUndefined();
    expect(queryIssues(issues)).toEqual([]);
    expect(issuesFor([{ field: 'sql', stepIndex: 0, message: 'One.' }, { field: 'sql', stepIndex: 0, message: 'Two.' }], 0, 'sql')).toBe(
      'One. Two.'
    );
  });
});
