import { PlaceholderRef } from './parse';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function placeholderSource(ref: PlaceholderRef): string {
  return `\\{\\{\\s*${escapeRegExp(ref.stepId)}\\.${escapeRegExp(ref.column)}\\s*\\}\\}`;
}

function sameRef(left: PlaceholderRef, right: PlaceholderRef): boolean {
  return left.stepId === right.stepId && left.column === right.column;
}

export function hasDependency(sql: string, ref: PlaceholderRef): boolean {
  return new RegExp(placeholderSource(ref)).test(sql);
}

/** Adds `column IN ({{step.column}})` when that placeholder is not already in the SQL. */
export function insertDependency(sql: string, ref: PlaceholderRef): string {
  if (hasDependency(sql, ref)) {
    return sql;
  }
  const clause = `${ref.column} IN ({{${ref.stepId}.${ref.column}}})`;
  const trimmed = sql.replace(/\s+$/, '');
  if (!trimmed.trim()) {
    return `WHERE ${clause}`;
  }
  if (/\bWHERE\b/i.test(trimmed)) {
    return `${trimmed}\n  AND ${clause}`;
  }
  return `${trimmed}\nWHERE ${clause}`;
}

/** Points an existing placeholder at a different step or column. */
export function replaceDependency(sql: string, previous: PlaceholderRef, next: PlaceholderRef): string {
  if (sameRef(previous, next)) {
    return sql;
  }
  if (hasDependency(sql, next)) {
    return removeDependency(sql, previous);
  }
  const token = placeholderSource(previous);
  const generated = new RegExp(`\\b${escapeRegExp(previous.column)}(\\s+IN\\s*\\(\\s*)${token}(\\s*\\))`, 'gi');
  if (generated.test(sql)) {
    return sql.replace(
      new RegExp(`\\b${escapeRegExp(previous.column)}(\\s+IN\\s*\\(\\s*)${token}(\\s*\\))`, 'gi'),
      `${next.column}$1{{${next.stepId}.${next.column}}}$2`
    );
  }
  return sql.replace(new RegExp(token, 'g'), `{{${next.stepId}.${next.column}}}`);
}

/** Removes one placeholder, including the IN list this editor added around it. */
export function removeDependency(sql: string, ref: PlaceholderRef): string {
  const ident = '(?:[A-Za-z_][A-Za-z0-9_]*\\s+)?';
  const list = `IN\\s*\\(\\s*${placeholderSource(ref)}\\s*\\)`;
  let next = sql.replace(new RegExp(`\\s+AND\\s+${ident}${list}`, 'gi'), '');
  next = next.replace(new RegExp(`WHERE\\s+${ident}${list}\\s+AND\\s+`, 'gi'), 'WHERE ');
  next = next.replace(new RegExp(`\\n?[ \\t]*WHERE\\s+${ident}${list}`, 'gi'), '');
  next = next.replace(new RegExp(placeholderSource(ref), 'g'), '');
  return next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
