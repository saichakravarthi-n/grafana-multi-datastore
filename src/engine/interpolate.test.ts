import { createDataFrame, FieldType } from '@grafana/data';

import { interpolateSql } from './interpolate';

describe('interpolateSql', () => {
  const framesByStep = new Map([
    [
      'users',
      [
        createDataFrame({
          fields: [
            { name: 'id', type: FieldType.number, values: [1, 2, 2, null, 3] },
            { name: 'name', type: FieldType.string, values: ["O'Brien", 'Ada', 'Ada', null, 'a\\b'] },
            { name: 'active', type: FieldType.boolean, values: [true, false, true, null, false] },
            { name: 'created', type: FieldType.time, values: [Date.parse('2024-01-02T03:04:05Z')] },
          ],
        }),
      ],
    ],
  ]);

  const options = {
    framesByStep,
    dialect: 'mysql' as const,
    maxListSize: 1000,
    consumerStepId: 'orders',
  };

  it('inserts distinct numbers and skips nulls', () => {
    expect(interpolateSql('SELECT * FROM orders WHERE user_id IN ({{users.id}})', options)).toBe(
      'SELECT * FROM orders WHERE user_id IN (1, 2, 3)'
    );
  });

  it('quotes strings and escapes quotes and MySQL backslashes', () => {
    expect(interpolateSql('WHERE name IN ({{users.name}})', options)).toBe("WHERE name IN ('O''Brien', 'Ada', 'a\\\\b')");
  });

  it('quotes strings with doubled quotes for PostgreSQL and does not rewrite backslashes', () => {
    expect(interpolateSql('WHERE name IN ({{users.name}})', { ...options, dialect: 'postgres' })).toBe(
      "WHERE name IN ('O''Brien', 'Ada', 'a\\b')"
    );
  });

  it('writes booleans for MySQL and PostgreSQL', () => {
    expect(interpolateSql('WHERE active IN ({{users.active}})', options)).toBe('WHERE active IN (1, 0)');
    expect(interpolateSql('WHERE active IN ({{users.active}})', { ...options, dialect: 'postgres' })).toBe(
      'WHERE active IN (TRUE, FALSE)'
    );
    expect(interpolateSql('WHERE active IN ({{users.active}})', { ...options, dialect: 'mssql' })).toBe(
      'WHERE active IN (1, 0)'
    );
  });

  it('quotes time values as UTC timestamps', () => {
    expect(interpolateSql('WHERE created IN ({{users.created}})', options)).toBe(
      "WHERE created IN ('2024-01-02 03:04:05')"
    );
  });

  it('uses NULL when the column has no values', () => {
    const empty = new Map([
      ['users', [createDataFrame({ fields: [{ name: 'id', type: FieldType.number, values: [null, undefined] }] })]],
    ]);
    expect(interpolateSql('WHERE id IN ({{users.id}})', { ...options, framesByStep: empty })).toBe('WHERE id IN (NULL)');
  });

  it('fails when the distinct list is over the cap', () => {
    expect(() => interpolateSql('WHERE id IN ({{users.id}})', { ...options, maxListSize: 2 })).toThrow(
      'Step "orders" cannot use {{users.id}}: that column has 3 values, which is over the limit of 2.'
    );
  });

  it('fails when the column is missing', () => {
    expect(() => interpolateSql('WHERE id IN ({{users.missing}})', options)).toThrow(
      'Step "orders" needs column "missing" from step "users", but that step did not return it.'
    );
  });

  it('matches a column name that differs only by case', () => {
    expect(interpolateSql('WHERE user_id IN ({{users.ID}})', options)).toBe('WHERE user_id IN (1, 2, 3)');
  });

  it('rejects a placeholder that is not step.column', () => {
    expect(() => interpolateSql('WHERE id IN ({{users}})', options)).toThrow(
      'Step "orders": Invalid placeholder "{{users}}". Use {{step.column}}.'
    );
  });
});
