import { DataFrame, Field, FieldType } from '@grafana/data';

import { isSqlDatasourceType, SqlDatasourceType } from '../types';
import { parsePlaceholders } from './parse';

export type SqlDialect = 'mysql' | 'postgres' | 'mssql';

export function dialectForType(type: string | undefined): SqlDialect | undefined {
  if (!isSqlDatasourceType(type)) {
    return undefined;
  }
  switch (type as SqlDatasourceType) {
    case 'mysql':
      return 'mysql';
    case 'postgres':
    case 'grafana-postgresql-datasource':
      return 'postgres';
    case 'mssql':
    case 'grafana-mssql-datasource':
      return 'mssql';
  }
}

export function interpolateSql(
  sql: string,
  options: {
    framesByStep: Map<string, DataFrame[]>;
    dialect: SqlDialect;
    maxListSize: number;
    consumerStepId: string;
  }
): string {
  const parsed = parsePlaceholders(sql);
  if (parsed.errors.length > 0) {
    throw new Error(`Step "${options.consumerStepId}": ${parsed.errors.join(' ')}`);
  }

  const literals = new Map<string, string>();
  for (const ref of parsed.refs) {
    const key = `${ref.stepId}.${ref.column}`;
    const frames = options.framesByStep.get(ref.stepId) ?? [];
    literals.set(
      key,
      columnLiteral(frames, ref.column, options.dialect, options.maxListSize, options.consumerStepId, ref.stepId)
    );
  }

  return sql.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_raw, stepId, column) => {
    return literals.get(`${stepId}.${column}`) as string;
  });
}

function columnLiteral(
  frames: DataFrame[],
  column: string,
  dialect: SqlDialect,
  maxListSize: number,
  consumerStepId: string,
  sourceStepId: string
): string {
  const field = findField(frames, column);
  if (!field) {
    throw new Error(
      `Step "${consumerStepId}" needs column "${column}" from step "${sourceStepId}", but that step did not return it.`
    );
  }

  const literals: string[] = [];
  const seen = new Set<string>();
  for (const value of fieldValues(field)) {
    if (value === null || value === undefined) {
      continue;
    }
    const literal = formatLiteral(value, field.type, dialect, consumerStepId, sourceStepId, column);
    if (seen.has(literal)) {
      continue;
    }
    seen.add(literal);
    literals.push(literal);
  }

  if (literals.length > maxListSize) {
    throw new Error(
      `Step "${consumerStepId}" cannot use {{${sourceStepId}.${column}}}: that column has ${literals.length} values, which is over the limit of ${maxListSize}.`
    );
  }

  if (literals.length === 0) {
    return 'NULL';
  }

  return literals.join(', ');
}

function findField(frames: DataFrame[], column: string): Field | undefined {
  const fields = frames.flatMap((frame) => frame.fields ?? []);
  const exact = fields.find((field) => field.name === column);
  if (exact) {
    return exact;
  }

  const lower = column.toLowerCase();
  const matches = fields.filter((field) => field.name.toLowerCase() === lower);
  return matches.length === 1 ? matches[0] : undefined;
}

function fieldValues(field: Field): unknown[] {
  const values: unknown = field.values;
  if (Array.isArray(values)) {
    return values;
  }
  if (isVector(values)) {
    if (typeof values.toArray === 'function') {
      return values.toArray();
    }
    const out: unknown[] = [];
    for (let index = 0; index < values.length; index++) {
      out.push(values.get(index));
    }
    return out;
  }
  return [];
}

function isVector(value: unknown): value is { length: number; get: (index: number) => unknown; toArray?: () => unknown[] } {
  return (
    !!value &&
    typeof value === 'object' &&
    'length' in value &&
    typeof (value as { get?: unknown }).get === 'function'
  );
}

function formatLiteral(
  value: unknown,
  type: FieldType | undefined,
  dialect: SqlDialect,
  consumerStepId: string,
  sourceStepId: string,
  column: string
): string {
  const placeholder = `{{${sourceStepId}.${column}}}`;
  const reject = (detail: string): never => {
    throw new Error(`Step "${consumerStepId}" cannot use ${placeholder}: ${detail}`);
  };

  if (type === FieldType.time || value instanceof Date) {
    return quoteString(formatTimestamp(value, reject), dialect);
  }

  if (type === FieldType.boolean || typeof value === 'boolean') {
    const bool = typeof value === 'boolean' ? value : value === 1 || value === '1' || value === 'true';
    if (dialect === 'postgres') {
      return bool ? 'TRUE' : 'FALSE';
    }
    return bool ? '1' : '0';
  }

  if (type === FieldType.string) {
    return quoteString(String(value), dialect);
  }

  if (type === FieldType.number || typeof value === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return reject('a value is not a finite number.');
    }
    return String(value);
  }

  if (typeof value === 'string') {
    return quoteString(value, dialect);
  }

  return reject('a value cannot be written as SQL.');
}

function formatTimestamp(value: unknown, reject: (detail: string) => never): string {
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) {
    return reject('a time value could not be formatted.');
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function quoteString(value: string, dialect: SqlDialect): string {
  let escaped = value;
  if (dialect === 'mysql') {
    escaped = escaped.replace(/\\/g, '\\\\');
  }
  escaped = escaped.replace(/'/g, "''");
  return `'${escaped}'`;
}
