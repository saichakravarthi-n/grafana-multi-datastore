import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

/** Grafana data source types this plugin can run. `postgres` and `mssql` are aliases for the standalone plugins. */
export const SQL_DATASOURCE_TYPES = [
  'mysql',
  'postgres',
  'grafana-postgresql-datasource',
  'mssql',
  'grafana-mssql-datasource',
] as const;

export type SqlDatasourceType = (typeof SQL_DATASOURCE_TYPES)[number];

export function isSqlDatasourceType(type: string | undefined): type is SqlDatasourceType {
  return !!type && (SQL_DATASOURCE_TYPES as readonly string[]).includes(type);
}

export const DEFAULT_MAX_LIST_SIZE = 1000;

export interface QueryStep {
  id: string;
  datasourceUid: string;
  datasourceType: string;
  rawSql: string;
  /** When true, the step can still feed later steps, but its rows are not shown in the panel. */
  hide: boolean;
}

export interface MultiQuery extends DataQuery {
  steps?: QueryStep[];
}

export interface MultiDataSourceOptions extends DataSourceJsonData {
  maxListSize?: number;
}

export function createStep(id: string, hide = false): QueryStep {
  return {
    id,
    datasourceUid: '',
    datasourceType: '',
    rawSql: '',
    hide,
  };
}

export function defaultQuery(): Partial<MultiQuery> {
  return {
    steps: [createStep('step1')],
  };
}

export function resolveMaxListSize(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_LIST_SIZE;
  }
  return parsed;
}
