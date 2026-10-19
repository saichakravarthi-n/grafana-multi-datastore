import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { Button, Combobox, Field, Input, useStyles2 } from '@grafana/ui';

import { insertDependency, removeDependency, replaceDependency } from '../engine/dependsOn';
import { databaseName } from '../engine/planRunOrder';
import { isValidStepId, parsePlaceholders, PlaceholderRef } from '../engine/parse';
import { QueryStep } from '../types';

interface ColumnDraft {
  key: string;
  column: string;
  saved?: PlaceholderRef;
  error?: string;
}

interface DependGroup {
  key: string;
  stepId: string;
  columns: ColumnDraft[];
}

interface Props {
  steps: QueryStep[];
  stepIndex: number;
  sql: string;
  error?: string;
  onSqlChange: (sql: string) => void;
}

let nextKey = 0;

function makeKey(): string {
  nextKey += 1;
  return `dep-${nextKey}`;
}

function emptyColumn(): ColumnDraft {
  return { key: makeKey(), column: '' };
}

function emptyGroup(): DependGroup {
  return { key: makeKey(), stepId: '', columns: [emptyColumn()] };
}

function groupsFromSql(sql: string): DependGroup[] {
  const groups: DependGroup[] = [];
  for (const ref of parsePlaceholders(sql).refs) {
    let group = groups.find((item) => item.stepId === ref.stepId);
    if (!group) {
      group = { key: makeKey(), stepId: ref.stepId, columns: [] };
      groups.push(group);
    }
    group.columns.push({ key: makeKey(), column: ref.column, saved: ref });
  }
  return groups.length > 0 ? groups : [emptyGroup()];
}

/** Keeps column boxes that are not in the SQL yet, and groups saved columns by database. */
export function reconcile(previous: DependGroup[], sql: string): DependGroup[] {
  const groups: DependGroup[] = [];
  for (const ref of parsePlaceholders(sql).refs) {
    let group = groups.find((item) => item.stepId === ref.stepId);
    if (!group) {
      const previousGroup = previous.find((item) => item.stepId === ref.stepId);
      group = { key: previousGroup?.key ?? makeKey(), stepId: ref.stepId, columns: [] };
      groups.push(group);
    }
    const previousColumn = previous
      .flatMap((item) => item.columns)
      .find((item) => item.saved?.stepId === ref.stepId && item.saved.column === ref.column);
    group.columns.push({ key: previousColumn?.key ?? makeKey(), column: ref.column, saved: ref });
  }

  for (const group of previous) {
    const unsaved = group.columns.filter((column) => !column.saved);
    if (unsaved.length === 0) {
      continue;
    }
    let target = group.stepId ? groups.find((item) => item.stepId === group.stepId) : undefined;
    if (!target) {
      target = { key: group.key, stepId: group.stepId, columns: [] };
      groups.push(target);
    }
    for (const column of unsaved) {
      const name = column.column.trim();
      if (name && target.columns.some((item) => item.column === name)) {
        continue;
      }
      target.columns.push(column);
    }
  }

  return groups.length > 0 ? groups : [emptyGroup()];
}

function databaseLabel(step: QueryStep): string {
  if (step.datasourceUid) {
    try {
      const name = getDataSourceSrv().getInstanceSettings(step.datasourceUid)?.name ?? '';
      if (name) {
        return name;
      }
    } catch {
      // Fall back to the database kind below.
    }
  }
  if (!step.datasourceType) {
    return '';
  }
  const kind = databaseName(step.datasourceType);
  return kind === 'this database' ? '' : kind;
}

export function DependsOnField({ steps, stepIndex, sql, error, onSqlChange }: Props) {
  const styles = useStyles2(getStyles);
  const [groups, setGroups] = useState<DependGroup[]>(() => groupsFromSql(sql));
  const groupsRef = useRef(groups);
  const sqlRef = useRef(sql);
  const options = steps.flatMap((step, index) => {
    if (index === stepIndex) {
      return [];
    }
    const id = step.id.trim();
    if (!isValidStepId(id)) {
      return [];
    }
    const database = databaseLabel(step);
    return [{ label: id, value: id, description: database || undefined }];
  });

  useEffect(() => {
    if (sql !== sqlRef.current) {
      sqlRef.current = sql;
      const nextGroups = groupsFromSql(sql);
      groupsRef.current = nextGroups;
      setGroups(nextGroups);
      return;
    }
    groupsRef.current = groups;
  }, [groups, sql]);

  const publish = (previous: DependGroup[], nextSql: string) => {
    const nextGroups = reconcile(previous, nextSql);
    groupsRef.current = nextGroups;
    sqlRef.current = nextSql;
    setGroups(nextGroups);
    if (nextSql !== sql) {
      onSqlChange(nextSql);
    }
  };

  const replaceGroups = (nextGroups: DependGroup[]) => {
    groupsRef.current = nextGroups;
    setGroups(nextGroups);
  };

  const changeDatastore = (groupIndex: number, stepId: string) => {
    const current = groupsRef.current.map((group, index) => (index === groupIndex ? { ...group, stepId } : group));
    const group = current[groupIndex];
    let nextSql = sqlRef.current;
    if (!isValidStepId(stepId)) {
      for (const column of group.columns) {
        if (column.saved) {
          nextSql = removeDependency(nextSql, column.saved);
        }
      }
      const cleared = current.map((item, index) =>
        index === groupIndex ? { ...item, columns: item.columns.map((column) => ({ ...column, saved: undefined })) } : item
      );
      publish(cleared, nextSql);
      return;
    }

    for (const column of group.columns) {
      const name = column.column.trim();
      if (!isValidStepId(name)) {
        continue;
      }
      const nextRef = { stepId, column: name };
      nextSql = column.saved ? replaceDependency(nextSql, column.saved, nextRef) : insertDependency(nextSql, nextRef);
    }
    publish(current, nextSql);
  };

  const commitColumn = (groupIndex: number, columnIndex: number) => {
    const group = groupsRef.current[groupIndex];
    const column = group.columns[columnIndex];
    const name = column.column.trim();
    const stepId = group.stepId.trim();
    const duplicate = group.columns.some((item, index) => index !== columnIndex && item.column.trim() === name && name !== '');

    if (!name && column.saved) {
      const drafted = groupsRef.current.map((item, index) =>
        index === groupIndex
          ? {
              ...item,
              columns: item.columns.map((entry, entryIndex) =>
                entryIndex === columnIndex ? { ...entry, column: '', saved: undefined, error: undefined } : entry
              ),
            }
          : item
      );
      publish(drafted, removeDependency(sqlRef.current, column.saved));
      return;
    }

    if (!name && !column.saved) {
      const next = groupsRef.current.map((item, index) =>
        index === groupIndex
          ? { ...item, columns: item.columns.map((entry, entryIndex) => (entryIndex === columnIndex ? { ...entry, error: undefined } : entry)) }
          : item
      );
      replaceGroups(next);
      return;
    }

    let message = '';
    if (!isValidStepId(stepId)) {
      message = 'Choose the step this one depends on.';
    } else if (duplicate) {
      message = 'That column is already listed for this step.';
    } else if (!isValidStepId(name)) {
      message = 'Use a column name such as id.';
    }
    if (message) {
      const next = groupsRef.current.map((item, index) =>
        index === groupIndex
          ? {
              ...item,
              columns: item.columns.map((entry, entryIndex) => (entryIndex === columnIndex ? { ...entry, error: message } : entry)),
            }
          : item
      );
      replaceGroups(next);
      return;
    }

    const nextRef = { stepId, column: name };
    let nextSql = sqlRef.current;
    if (column.saved) {
      nextSql = replaceDependency(nextSql, column.saved, nextRef);
    } else {
      nextSql = insertDependency(nextSql, nextRef);
    }
    const drafted = groupsRef.current.map((item, index) =>
      index === groupIndex
        ? {
            ...item,
            columns: item.columns.map((entry, entryIndex) =>
              entryIndex === columnIndex ? { ...entry, column: name, saved: nextRef, error: undefined } : entry
            ),
          }
        : item
    );
    publish(drafted, nextSql);
  };

  const removeColumn = (groupIndex: number, columnIndex: number) => {
    const group = groupsRef.current[groupIndex];
    const column = group.columns[columnIndex];
    const remaining = group.columns.filter((_, index) => index !== columnIndex);
    const nextGroups = groupsRef.current.map((item, index) =>
      index === groupIndex ? { ...item, columns: remaining.length > 0 ? remaining : [emptyColumn()] } : item
    );
    let nextSql = sqlRef.current;
    if (column.saved) {
      nextSql = removeDependency(nextSql, column.saved);
    }
    publish(nextGroups, nextSql);
  };

  const removeGroup = (groupIndex: number) => {
    const group = groupsRef.current[groupIndex];
    let nextSql = sqlRef.current;
    for (const column of group.columns) {
      if (column.saved) {
        nextSql = removeDependency(nextSql, column.saved);
      }
    }
    publish(
      groupsRef.current.filter((_, index) => index !== groupIndex),
      nextSql
    );
  };

  return (
    <Field
      label="Depends on"
      description="Choose which step this one depends on. Then add each column from that step, such as id and name. Add another step only when this one also depends on a different step."
      invalid={!!error}
      error={error}
    >
      <div className={styles.list}>
        {groups.map((group, groupIndex) => {
          const selected = options.find((option) => option.value === group.stepId);
          const value = group.stepId ? selected ?? { label: group.stepId, value: group.stepId } : null;
          const taken = new Set(groups.filter((_, index) => index !== groupIndex).map((item) => item.stepId));
          const available = options.filter((option) => !taken.has(option.value));
          const canRemoveGroup = groups.length > 1 || group.stepId !== '' || group.columns.some((column) => column.column !== '' || column.saved);
          return (
            <div key={group.key} className={styles.group}>
              <div className={styles.header}>
                <Combobox
                  aria-label={`Depends on step ${groupIndex + 1}`}
                  placeholder="Choose a step"
                  options={available}
                  value={value}
                  isClearable
                  noOptionsMessage="Add the other step first."
                  onChange={(option) => changeDatastore(groupIndex, option?.value ?? '')}
                />
                {canRemoveGroup ? (
                  <Button
                    variant="secondary"
                    fill="text"
                    icon="times"
                    aria-label={`Remove dependency ${groupIndex + 1}`}
                    onClick={() => removeGroup(groupIndex)}
                  />
                ) : (
                  <span />
                )}
              </div>
              {group.columns.map((column, columnIndex) => {
                const canRemoveColumn = group.columns.length > 1 || column.column !== '' || !!column.saved;
                return (
                  <div key={column.key}>
                    <div className={styles.column}>
                      <Input
                        aria-label={`Depends on column ${columnIndex + 1} of step ${groupIndex + 1}`}
                        placeholder="id"
                        value={column.column}
                        invalid={!!column.error}
                        onChange={(event) => {
                          const nextColumn = event.currentTarget.value;
                          const next = groupsRef.current.map((item, index) =>
                            index === groupIndex
                              ? {
                                  ...item,
                                  columns: item.columns.map((entry, entryIndex) =>
                                    entryIndex === columnIndex ? { ...entry, column: nextColumn, error: undefined } : entry
                                  ),
                                }
                              : item
                          );
                          replaceGroups(next);
                        }}
                        onBlur={() => commitColumn(groupIndex, columnIndex)}
                      />
                      {canRemoveColumn ? (
                        <Button
                          variant="secondary"
                          fill="text"
                          icon="times"
                          aria-label={`Remove column ${columnIndex + 1} of step ${groupIndex + 1}`}
                          onClick={() => removeColumn(groupIndex, columnIndex)}
                        />
                      ) : (
                        <span />
                      )}
                    </div>
                    {column.error ? <p className={styles.columnError}>{column.error}</p> : null}
                  </div>
                );
              })}
              <div>
                <Button
                  variant="secondary"
                  fill="text"
                  icon="plus"
                  onClick={() => {
                    const next = groupsRef.current.map((item, index) =>
                      index === groupIndex ? { ...item, columns: [...item.columns, emptyColumn()] } : item
                    );
                    replaceGroups(next);
                  }}
                >
                  Add column
                </Button>
              </div>
            </div>
          );
        })}
        <div>
          <Button variant="secondary" icon="plus" onClick={() => replaceGroups([...groupsRef.current, emptyGroup()])}>
            Depends on another step
          </Button>
        </div>
      </div>
    </Field>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  list: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  }),
  group: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(1),
    background: theme.colors.background.primary,
  }),
  header: css({
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 1fr) auto',
    alignItems: 'center',
    gap: theme.spacing(1),
  }),
  column: css({
    display: 'grid',
    gridTemplateColumns: 'minmax(140px, 240px) auto',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginLeft: theme.spacing(2),
  }),
  columnError: css({
    margin: 0,
    marginLeft: theme.spacing(2),
    color: theme.colors.error.text,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
});
