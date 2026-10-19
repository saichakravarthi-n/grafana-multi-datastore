import { DataFrame } from '@grafana/data';

import { QueryStep } from '../types';
import { dialectForType, interpolateSql } from './interpolate';
import { executionWaves } from './order';
import { isValidStepId, parsePlaceholders, PlaceholderRef } from './parse';

export interface ExecuteOptions {
  steps: QueryStep[];
  maxListSize: number;
  panelRefId: string;
  runQuery: (step: QueryStep, rawSql: string) => Promise<DataFrame[]>;
}

/**
 * Runs the steps a visible result depends on, in dependency order, and returns frames for visible steps.
 * Hidden steps still run when a later step reads their columns.
 */
export async function executeSteps(options: ExecuteOptions): Promise<DataFrame[]> {
  const steps = options.steps;
  assertUniqueIds(steps);

  const visible = steps.filter((step) => !step.hide);
  if (visible.length === 0) {
    throw new Error('Choose at least one step to show in the panel.');
  }

  const byId = new Map(steps.map((step) => [step.id, step]));
  const refsById = new Map<string, PlaceholderRef[]>();
  const required = requiredSteps(visible, byId, refsById).sort((a, b) => steps.indexOf(a) - steps.indexOf(b));

  for (const step of required) {
    assertRunnable(step);
  }

  const waves = executionWaves(
    required.map((step) => ({
      id: step.id,
      dependsOn: [...new Set((refsById.get(step.id) as PlaceholderRef[]).map((ref) => ref.stepId))],
    }))
  );

  const framesByStep = new Map<string, DataFrame[]>();

  for (const wave of waves) {
    await Promise.all(
      wave.map(async (id) => {
        const step = byId.get(id) as QueryStep;
        const dialect = dialectForType(step.datasourceType) as NonNullable<ReturnType<typeof dialectForType>>;

        const sql = interpolateSql(step.rawSql, {
          framesByStep,
          dialect,
          maxListSize: options.maxListSize,
          consumerStepId: step.id,
        });

        let frames: DataFrame[];
        try {
          frames = await options.runQuery(step, sql);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Step "${step.id}" failed: ${message}`);
        }

        framesByStep.set(
          id,
          frames.map((frame) => ({
            ...frame,
            fields: frame.fields,
            length: frame.length ?? frame.fields?.[0]?.values?.length ?? 0,
            meta: {
              ...frame.meta,
              executedQueryString: frame.meta?.executedQueryString || sql,
            },
          }))
        );
      })
    );
  }

  const multiple = visible.length > 1;
  const output: DataFrame[] = [];
  for (const step of visible) {
    const refId = multiple ? `${options.panelRefId}_${step.id}` : options.panelRefId;
    for (const frame of framesByStep.get(step.id) as DataFrame[]) {
      output.push({
        ...frame,
        refId,
        fields: frame.fields,
        length: frame.length,
      });
    }
  }

  return output;
}

function assertUniqueIds(steps: QueryStep[]) {
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.id.trim()) {
      throw new Error('Every step needs an id.');
    }
    if (!isValidStepId(step.id)) {
      throw new Error(
        `Step id "${step.id}" must start with a letter or underscore and use only letters, numbers, and underscores.`
      );
    }
    if (seen.has(step.id)) {
      throw new Error(`Step id "${step.id}" is used more than once.`);
    }
    seen.add(step.id);
  }
}

function requiredSteps(visible: QueryStep[], byId: Map<string, QueryStep>, refsById: Map<string, PlaceholderRef[]>): QueryStep[] {
  const requiredIds = new Set<string>();
  const pending = visible.map((step) => step.id);

  while (pending.length > 0) {
    const id = pending.pop() as string;
    if (requiredIds.has(id)) {
      continue;
    }
    requiredIds.add(id);

    const step = byId.get(id) as QueryStep;
    const parsed = parsePlaceholders(step.rawSql);
    if (parsed.errors.length > 0) {
      throw new Error(`Step "${step.id}": ${parsed.errors.join(' ')}`);
    }
    refsById.set(step.id, parsed.refs);

    for (const ref of parsed.refs) {
      if (!byId.has(ref.stepId)) {
        throw new Error(`Step "${step.id}" references "{{${ref.stepId}.${ref.column}}}", but there is no step named "${ref.stepId}".`);
      }
      pending.push(ref.stepId);
    }
  }

  return [...requiredIds].map((id) => byId.get(id)).filter((step): step is QueryStep => !!step);
}

function assertRunnable(step: QueryStep) {
  if (!step.rawSql.trim()) {
    throw new Error(`Step "${step.id}" needs a SQL query.`);
  }
  if (!step.datasourceUid) {
    throw new Error(`Step "${step.id}" needs a MySQL, PostgreSQL, or SQL Server data source.`);
  }
  if (!dialectForType(step.datasourceType)) {
    throw new Error(
      `Step "${step.id}" uses data source type "${step.datasourceType || 'unknown'}", which is not a supported SQL data source.`
    );
  }
}
