export interface StepNode {
  id: string;
  dependsOn: string[];
}

/**
 * Groups steps into waves that can run at the same time.
 * A step is in a wave only after every step it references has already run.
 */
export function executionWaves(nodes: StepNode[]): string[][] {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) {
      throw new Error(`Step id "${node.id}" is used more than once.`);
    }
    ids.add(node.id);
  }

  const deps = new Map<string, Set<string>>();
  for (const node of nodes) {
    const set = new Set<string>();
    for (const dep of node.dependsOn) {
      if (!ids.has(dep)) {
        throw new Error(`Step "${node.id}" references step "${dep}", but there is no step with that id.`);
      }
      set.add(dep);
    }
    deps.set(node.id, set);
  }

  const remaining = new Map(deps);
  const emitted = new Set<string>();
  const waves: string[][] = [];
  const order = nodes.map((node) => node.id);

  while (remaining.size > 0) {
    const wave = order.filter((id) => {
      if (!remaining.has(id)) {
        return false;
      }
      const pending = [...(remaining.get(id) as Set<string>)].filter((dep) => !emitted.has(dep));
      return pending.length === 0;
    });

    if (wave.length === 0) {
      throw new Error(cycleMessage(findCycle(remaining)));
    }

    for (const id of wave) {
      remaining.delete(id);
      emitted.add(id);
    }
    waves.push(wave);
  }

  return waves;
}

function cycleMessage(cycle: string[]): string {
  if (cycle.length <= 1) {
    return `Step "${cycle[0]}" depends on itself.`;
  }
  if (cycle.length === 2) {
    return `Steps "${cycle[0]}" and "${cycle[1]}" depend on each other.`;
  }
  return `Steps ${cycle.map((id) => `"${id}"`).join(', ')} form a dependency cycle.`;
}

export function findCycle(deps: Map<string, Set<string>>): string[] {
  const visiting = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): string[] => {
    if (visiting.has(id)) {
      return stack.slice(stack.indexOf(id));
    }

    visiting.add(id);
    stack.push(id);
    for (const dep of deps.get(id) as Set<string>) {
      return visit(dep);
    }

    return [id];
  };

  return visit(deps.keys().next().value as string);
}
