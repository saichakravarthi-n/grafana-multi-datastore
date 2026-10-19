import { QueryStep } from '../types';
import { dialectForType } from './interpolate';
import { executionWaves } from './order';
import { isValidStepId, parsePlaceholders } from './parse';

export type StepIssueField = 'id' | 'datasource' | 'depends' | 'sql' | 'query';

export interface StepIssue {
  field: StepIssueField;
  /** Set when the problem belongs to one step. Query-level problems omit it. */
  stepIndex?: number;
  message: string;
}

/**
 * Checks a query before it runs. A blank first step is allowed so a new panel is not covered in errors.
 */
export function validateSteps(steps: QueryStep[]): StepIssue[] {
  const issues: StepIssue[] = [];
  const queryStarted = steps.some((step) => step.rawSql.trim().length > 0 || !!step.datasourceUid);

  steps.forEach((step, index) => {
    const id = step.id.trim();
    const duplicate = id.length > 0 && steps.filter((candidate) => candidate.id.trim() === id).length > 1;
    const referenced = isReferenced(step, steps);
    const hasSql = step.rawSql.trim().length > 0;
    const hasDatabase = !!step.datasourceUid;
    const active = hasSql || hasDatabase || referenced || (!step.hide && queryStarted);

    if (!id) {
      if (active) {
        issues.push({ field: 'id', stepIndex: index, message: 'Give this step a name, such as users.' });
      }
    } else if (!isValidStepId(id)) {
      issues.push({
        field: 'id',
        stepIndex: index,
        message: 'Use letters, numbers, and underscores only, and start with a letter. Example: users.',
      });
    } else if (duplicate) {
      issues.push({
        field: 'id',
        stepIndex: index,
        message: `Another step is already named "${id}". Each step needs its own name.`,
      });
    }

    if (active && !hasDatabase) {
      issues.push({
        field: 'datasource',
        stepIndex: index,
        message: 'Choose MySQL, PostgreSQL, or SQL Server.',
      });
    } else if (hasDatabase && step.datasourceType && !dialectForType(step.datasourceType)) {
      issues.push({
        field: 'datasource',
        stepIndex: index,
        message: 'This plugin only runs MySQL, PostgreSQL, and SQL Server.',
      });
    }

    if (active && !hasSql) {
      issues.push({
        field: 'sql',
        stepIndex: index,
        message: referenced
          ? 'Another step reads this one, so it needs a SQL query.'
          : 'Write the SQL for this step.',
      });
    }

    if (!hasSql) {
      return;
    }

    const parsed = parsePlaceholders(step.rawSql);
    for (const error of parsed.errors) {
      const invalid = /^Invalid placeholder "(.+)"\. Use \{\{step\.column\}\}\.$/.exec(error) as RegExpExecArray;
      issues.push({
        field: 'sql',
        stepIndex: index,
        message: `“${invalid[1]}” is not valid. Use a step name and a column, such as {{users.id}}.`,
      });
    }

    const knownIds = new Set(steps.map((candidate) => candidate.id.trim()));
    for (const ref of parsed.refs) {
      if (ref.stepId === id) {
        issues.push({
          field: 'depends',
          stepIndex: index,
          message: `This step cannot read its own column. Point {{${ref.stepId}.${ref.column}}} at a different step.`,
        });
      } else if (!knownIds.has(ref.stepId)) {
        issues.push({
          field: 'depends',
          stepIndex: index,
          message: `There is no step named "${ref.stepId}". Add that step, or fix {{${ref.stepId}.${ref.column}}}.`,
        });
      }
      if (!isInsideInList(step.rawSql, ref.stepId, ref.column)) {
        issues.push({
          field: 'sql',
          stepIndex: index,
          message: `Write IN ({{${ref.stepId}.${ref.column}}}). The placeholder becomes a list, such as 1, 2, 3.`,
        });
      }
    }
  });

  if (queryStarted && steps.every((step) => step.hide)) {
    issues.push({
      field: 'query',
      message: 'Turn on “Show these rows in the panel” for the step you want the table to display.',
    });
  }

  const cycle = cycleMessage(steps);
  if (cycle) {
    issues.push({ field: 'query', message: cycle });
  }

  return issues;
}

export function issuesFor(issues: StepIssue[], stepIndex: number, field: StepIssueField): string | undefined {
  const messages = issues.filter((issue) => issue.stepIndex === stepIndex && issue.field === field).map((issue) => issue.message);
  return messages.length > 0 ? messages.join(' ') : undefined;
}

export function queryIssues(issues: StepIssue[]): string[] {
  return issues.filter((issue) => issue.field === 'query').map((issue) => issue.message);
}

function isReferenced(step: QueryStep, steps: QueryStep[]): boolean {
  const id = step.id.trim();
  if (!id) {
    return false;
  }
  return steps.some((other) => other !== step && parsePlaceholders(other.rawSql).refs.some((ref) => ref.stepId === id));
}

function isInsideInList(sql: string, stepId: string, column: string): boolean {
  const placeholder = new RegExp(`\\{\\{\\s*${escapeRegExp(stepId)}\\.${escapeRegExp(column)}\\s*\\}\\}`, 'g');
  for (const match of sql.matchAll(placeholder)) {
    const index = match.index as number;
    const before = sql.slice(0, index);
    const open = before.lastIndexOf('(');
    const inKeyword = before.slice(Math.max(0, open - 12), open);
    if (open === -1 || !/IN\s*$/i.test(inKeyword)) {
      return false;
    }
  }
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cycleMessage(steps: QueryStep[]): string | undefined {
  const usable = steps.filter((step) => isValidStepId(step.id.trim()));
  if (new Set(usable.map((step) => step.id.trim())).size !== usable.length) {
    return undefined;
  }

  try {
    executionWaves(
      usable.map((step) => ({
        id: step.id.trim(),
        dependsOn: parsePlaceholders(step.rawSql)
          .refs.map((ref) => ref.stepId)
          .filter((id) => id !== step.id.trim() && usable.some((candidate) => candidate.id.trim() === id)),
      }))
    );
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('depend on each other') || message.includes('dependency cycle') || message.includes('depends on itself')) {
      return message.replace('depend on each other', 'wait on each other, so neither can run first').replace('depends on itself', 'reads itself, so it cannot run');
    }
    return undefined;
  }
}
