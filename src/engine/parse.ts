const STEP_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VALID_PLACEHOLDER = /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/;
const ANY_PLACEHOLDER = /\{\{[\s\S]*?\}\}/g;

export interface PlaceholderRef {
  stepId: string;
  column: string;
}

export interface ParseResult {
  refs: PlaceholderRef[];
  errors: string[];
}

export function isValidStepId(id: string): boolean {
  return STEP_ID_PATTERN.test(id);
}

/**
 * Finds `{{step.column}}` placeholders. Anything else inside `{{ }}` is reported as an error.
 * Repeated references to the same step and column are returned once.
 */
export function parsePlaceholders(sql: string): ParseResult {
  const refs: PlaceholderRef[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const match of sql.matchAll(ANY_PLACEHOLDER)) {
    const raw = match[0];
    const valid = VALID_PLACEHOLDER.exec(raw);
    if (!valid) {
      errors.push(`Invalid placeholder "${raw}". Use {{step.column}}.`);
      continue;
    }

    const stepId = valid[1];
    const column = valid[2];
    const key = `${stepId}.${column}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    refs.push({ stepId, column });
  }

  return { refs, errors };
}

export function dependencyStepIds(sql: string): string[] {
  const { refs } = parsePlaceholders(sql);
  return [...new Set(refs.map((ref) => ref.stepId))];
}
