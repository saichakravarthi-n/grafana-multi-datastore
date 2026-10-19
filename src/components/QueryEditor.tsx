import React, { ChangeEvent } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, QueryEditorProps } from '@grafana/data';
import { DataSourcePicker } from '@grafana/runtime';
import { Alert, Button, CodeEditor, Field, InlineSwitch, Input, Stack, useStyles2 } from '@grafana/ui';

import { DependsOnField } from './DependsOnField';
import { DataSource } from '../datasource';
import { databaseName, planRunOrder, PlannedStep } from '../engine/planRunOrder';
import { issuesFor, queryIssues, validateSteps } from '../engine/validate';
import { MultiDataSourceOptions, MultiQuery, QueryStep, SQL_DATASOURCE_TYPES, createStep, isSqlDatasourceType } from '../types';

type Props = QueryEditorProps<DataSource, MultiQuery, MultiDataSourceOptions>;

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const styles = useStyles2(getStyles);
  const steps = query.steps?.length ? query.steps : [createStep('step1')];
  const issues = validateSteps(steps);
  const formIssues = queryIssues(issues);
  const runOrder = planRunOrder(steps);
  const ordered = runOrder ? [...runOrder].sort(byRunOrder) : undefined;

  const updateSteps = (next: QueryStep[], run = false) => {
    onChange({ ...query, steps: next });
    if (run && next.some((step) => step.rawSql.trim().length > 0) && validateSteps(next).length === 0) {
      onRunQuery();
    }
  };

  const updateStep = (index: number, step: QueryStep, run = false) => {
    updateSteps(
      steps.map((current, currentIndex) => (currentIndex === index ? step : current)),
      run
    );
  };

  const addStep = () => {
    const onlyLastVisible = steps.filter((step) => !step.hide).length === 1 && !steps[steps.length - 1].hide;
    const next = steps.map((step, index) => (onlyLastVisible && index === steps.length - 1 ? { ...step, hide: true } : step));
    updateSteps([...next, createStep(nextStepId(steps), false)]);
  };

  const removeStep = (index: number) => {
    const next = steps.filter((_, currentIndex) => currentIndex !== index);
    if (next.length === 0) {
      updateSteps([createStep('step1')], true);
      return;
    }
    if (next.every((step) => step.hide)) {
      next[next.length - 1] = { ...next[next.length - 1], hide: false };
    }
    updateSteps(next, true);
  };

  return (
    <Stack direction="column" gap={2}>
      <div className={styles.order}>
        <h3 className={styles.orderTitle}>Which database runs first</h3>
        <p className={styles.intro}>
          Add the step that does not depend on another one first. On a later step, choose which step it depends on, then add
          the columns, such as <span className={styles.example}>id</span>.
        </p>
        {ordered && ordered.length > 0 ? (
          <div className={styles.orderGroups}>
            {orderGroups(ordered).map((group) => (
              <div key={group.key}>
                <p className={styles.groupTitle}>{group.title}</p>
                <ul className={styles.orderList}>
                  {group.items.map((item) => (
                    <li key={item.id}>{orderLine(item)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.intro}>The run order appears here after each step has its own name.</p>
        )}
      </div>
      {formIssues.map((message) => (
        <Alert key={message} severity="error" title="This query cannot run">
          {message}
        </Alert>
      ))}
      {steps.map((step, index) => {
        const nameError = issuesFor(issues, index, 'id');
        const databaseError = issuesFor(issues, index, 'datasource');
        const dependsError = issuesFor(issues, index, 'depends');
        const sqlError = issuesFor(issues, index, 'sql');
        const planned = runOrder?.find((item) => item.id === step.id.trim());
        return (
          <section className={styles.step} key={index} aria-label={`Step ${index + 1}`}>
            <div className={styles.header}>
              <h3 className={styles.title}>{step.id.trim() ? step.id.trim() : `Step ${index + 1}`}</h3>
              <p className={styles.status}>{cardOrder(planned, databaseName(step.datasourceType))}</p>
            </div>
            <div className={styles.fields}>
              <Field
                label="Name"
                description="Later steps use this name."
                invalid={!!nameError}
                error={nameError}
                noMargin
              >
                <Input
                  id={`step-name-${index}`}
                  aria-label="Step id"
                  placeholder="users"
                  value={step.id}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => updateStep(index, { ...step, id: event.currentTarget.value })}
                />
              </Field>
              <Field
                label="Database"
                description="MySQL, PostgreSQL, or SQL Server already added in Grafana."
                invalid={!!databaseError}
                error={databaseError}
                noMargin
              >
                <DataSourcePicker
                  current={step.datasourceUid || undefined}
                  type={[...SQL_DATASOURCE_TYPES]}
                  noDefault
                  placeholder="Choose a database"
                  invalid={!!databaseError}
                  filter={(datasource) => isSqlDatasourceType(datasource.type) || isSqlDatasourceType(datasource.meta?.id)}
                  onChange={(datasource) =>
                    updateStep(index, { ...step, datasourceUid: datasource.uid, datasourceType: datasource.type }, true)
                  }
                />
              </Field>
            </div>
            <Field
              label="Show these rows in the panel"
              description="Turn this off when the step only passes values to a later step."
            >
              <InlineSwitch
                aria-label="Show in panel"
                showLabel
                value={!step.hide}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateStep(index, { ...step, hide: !event.currentTarget.checked }, true)
                }
              />
            </Field>
            <DependsOnField
              steps={steps}
              stepIndex={index}
              sql={step.rawSql}
              error={dependsError}
              onSqlChange={(rawSql) => updateStep(index, { ...step, rawSql }, true)}
            />
            <Field
              label="SQL"
              description="Depends on writes IN ({{users.id}}) here. You can edit this query."
              invalid={!!sqlError}
              error={sqlError}
              noMargin
            >
              <CodeEditor
                language="sql"
                width="100%"
                height={120}
                showLineNumbers
                value={step.rawSql}
                onChange={(rawSql) => updateStep(index, { ...step, rawSql })}
                onBlur={(rawSql) => updateStep(index, { ...step, rawSql }, true)}
              />
            </Field>
            <div className={styles.remove}>
              <Button variant="secondary" fill="text" icon="trash-alt" onClick={() => removeStep(index)}>
                Remove step
              </Button>
            </div>
          </section>
        );
      })}
      <div>
        <Button variant="secondary" icon="plus" onClick={addStep}>
          Add step
        </Button>
      </div>
    </Stack>
  );
}

function waveRank(item: PlannedStep): number {
  if (item.wave) {
    return item.wave;
  }
  return Number.MAX_SAFE_INTEGER;
}

function byRunOrder(left: PlannedStep, right: PlannedStep): number {
  return waveRank(left) - waveRank(right);
}

function orderGroups(plan: PlannedStep[]): Array<{ key: string; title: string; items: PlannedStep[] }> {
  const ready = plan.filter((item) => item.wave);
  const waves = [...new Set(ready.map((item) => item.wave as number))].sort((left, right) => left - right);
  const groups = waves.map((wave) => ({
    key: String(wave),
    title:
      wave === 1
        ? '1. Add these first. They do not depend on another database.'
        : `${wave}. Add these next. They depend on a database above.`,
    items: ready.filter((item) => item.wave === wave),
  }));
  const missing = plan.filter((item) => !item.wave);
  if (missing.length > 0) {
    groups.push({
      key: 'missing',
      title: 'Waiting. Add the database they depend on first.',
      items: missing,
    });
  }
  return groups;
}

function orderLine(item: PlannedStep): string {
  const database = databaseName(item.datasourceType);
  if (item.missing.length > 0) {
    return `${item.id} (${database}) depends on ${item.missing.join(' and ')}.`;
  }
  if (item.dependsOn.length === 0) {
    return `${item.id} (${database}).`;
  }
  return `${item.id} (${database}) depends on ${item.dependsOn.join(' and ')}.`;
}

function cardOrder(item: PlannedStep | undefined, database: string): string {
  if (!item) {
    return 'Run order is waiting for a valid step name.';
  }
  if (item.missing.length > 0) {
    return `Depends on ${item.missing.join(' and ')}. Add that step first.`;
  }
  if (!item.wave || item.dependsOn.length === 0) {
    return `Runs first on ${database}. Add this step first.`;
  }
  return `Runs ${ordinal(item.wave)} on ${database}. Depends on ${item.dependsOn.join(' and ')}. Add that step first.`;
}

function ordinal(wave: number): string {
  if (wave === 2) {
    return '2nd';
  }
  if (wave === 3) {
    return '3rd';
  }
  return `${wave}th`;
}

function nextStepId(steps: QueryStep[]): string {
  const ids = new Set(steps.map((step) => step.id));
  let number = steps.length + 1;
  while (ids.has(`step${number}`)) {
    number += 1;
  }
  return `step${number}`;
}

const getStyles = (theme: GrafanaTheme2) => ({
  order: css({
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(2),
    background: theme.colors.background.primary,
  }),
  orderTitle: css({
    ...theme.typography.h5,
    margin: 0,
    marginBottom: theme.spacing(1),
  }),
  orderGroups: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1.5),
  }),
  groupTitle: css({
    margin: 0,
    fontWeight: theme.typography.fontWeightMedium,
  }),
  orderList: css({
    margin: 0,
    marginTop: theme.spacing(0.5),
    paddingLeft: theme.spacing(3),
    color: theme.colors.text.primary,
  }),
  intro: css({
    color: theme.colors.text.secondary,
    margin: 0,
    maxWidth: 720,
  }),
  example: css({
    color: theme.colors.text.primary,
    fontFamily: theme.typography.fontFamilyMonospace,
  }),
  step: css({
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.secondary,
    padding: theme.spacing(2),
  }),
  header: css({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
    flexWrap: 'wrap',
  }),
  title: css({
    ...theme.typography.h5,
    margin: 0,
  }),
  status: css({
    color: theme.colors.text.secondary,
    margin: 0,
  }),
  fields: css({
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 240px) minmax(240px, 1fr)',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
    [theme.breakpoints.down('md')]: {
      gridTemplateColumns: '1fr',
    },
  }),
  remove: css({
    marginTop: theme.spacing(1),
  }),
});
