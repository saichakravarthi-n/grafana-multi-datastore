import { createStep, defaultQuery, isSqlDatasourceType, resolveMaxListSize } from '../../src/types';

describe('types', () => {
  it('accepts the SQL data source types and rejects anything else', () => {
    expect(isSqlDatasourceType('mysql')).toBe(true);
    expect(isSqlDatasourceType('postgres')).toBe(true);
    expect(isSqlDatasourceType('grafana-postgresql-datasource')).toBe(true);
    expect(isSqlDatasourceType('mssql')).toBe(true);
    expect(isSqlDatasourceType('grafana-mssql-datasource')).toBe(true);
    expect(isSqlDatasourceType(undefined)).toBe(false);
    expect(isSqlDatasourceType('prometheus')).toBe(false);
  });

  it('builds a blank step and the default query', () => {
    expect(createStep('users', true)).toEqual({
      id: 'users',
      datasourceUid: '',
      datasourceType: '',
      rawSql: '',
      hide: true,
    });
    expect(defaultQuery()).toEqual({ steps: [createStep('step1')] });
  });

  it('keeps a positive integer list size and falls back otherwise', () => {
    expect(resolveMaxListSize(25)).toBe(25);
    expect(resolveMaxListSize('40')).toBe(40);
    expect(resolveMaxListSize('')).toBe(1000);
    expect(resolveMaxListSize('  ')).toBe(1000);
    expect(resolveMaxListSize('nope')).toBe(1000);
    expect(resolveMaxListSize(1.5)).toBe(1000);
    expect(resolveMaxListSize(0)).toBe(1000);
    expect(resolveMaxListSize(-3)).toBe(1000);
    expect(resolveMaxListSize(undefined)).toBe(1000);
  });
});
