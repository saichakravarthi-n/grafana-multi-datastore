import { QueryStep } from '../types';
import { executionWaves } from './order';
import { dependencyStepIds, isValidStepId } from './parse';

export interface PlannedStep {
  id: string;
  /** 1 means this database runs first. Empty when a named step is still missing. */
  wave?: number;
  dependsOn: string[];
  missing: string[];
  datasourceType: string;
}

/** The order databases run in. Undefined when names are invalid, repeated, or the steps wait on each other. */
export function planRunOrder(steps: QueryStep[]): PlannedStep[] | undefined {
  const ids = steps.map((step) => step.id.trim());
  if (ids.some((id) => !isValidStepId(id)) || new Set(ids).size !== ids.length) {
    return undefined;
  }

  const planned = steps.map((step) => {
    const refs = dependencyStepIds(step.rawSql);
    return {
      id: step.id.trim(),
      dependsOn: refs.filter((id) => ids.includes(id) && id !== step.id.trim()),
      missing: refs.filter((id) => !ids.includes(id)),
      datasourceType: step.datasourceType,
    };
  });

  try {
    const waves = executionWaves(planned.map((step) => ({ id: step.id, dependsOn: step.dependsOn })));
    const waveOf = new Map<string, number>();
    waves.forEach((wave, index) => {
      wave.forEach((id) => waveOf.set(id, index + 1));
    });

    return planned.map((step) => ({
      ...step,
      wave: step.missing.length > 0 ? undefined : waveOf.get(step.id),
    }));
  } catch {
    return undefined;
  }
}

export function databaseName(type: string | undefined): string {
  switch (type) {
    case 'mysql':
      return 'MySQL';
    case 'postgres':
    case 'grafana-postgresql-datasource':
      return 'PostgreSQL';
    case 'mssql':
    case 'grafana-mssql-datasource':
      return 'SQL Server';
    default:
      return 'this database';
  }
}
