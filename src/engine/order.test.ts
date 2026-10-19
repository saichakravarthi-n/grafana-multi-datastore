import { executionWaves } from './order';

describe('executionWaves', () => {
  it('runs independent steps in one wave and the dependent step after them', () => {
    expect(
      executionWaves([
        { id: 'users', dependsOn: [] },
        { id: 'regions', dependsOn: [] },
        { id: 'orders', dependsOn: ['users', 'regions'] },
      ])
    ).toEqual([['users', 'regions'], ['orders']]);
  });

  it('keeps a chain in order', () => {
    expect(
      executionWaves([
        { id: 'orders', dependsOn: ['users'] },
        { id: 'users', dependsOn: [] },
      ])
    ).toEqual([['users'], ['orders']]);
  });

  it('names both steps in a cycle', () => {
    expect(() =>
      executionWaves([
        { id: 'users', dependsOn: ['orders'] },
        { id: 'orders', dependsOn: ['users'] },
      ])
    ).toThrow('Steps "users" and "orders" depend on each other.');
  });

  it('names a step that depends on itself', () => {
    expect(() => executionWaves([{ id: 'users', dependsOn: ['users'] }])).toThrow('Step "users" depends on itself.');
  });

  it('names a longer cycle', () => {
    expect(() =>
      executionWaves([
        { id: 'a', dependsOn: ['c'] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['b'] },
      ])
    ).toThrow('Steps "a", "c", "b" form a dependency cycle.');
  });

  it('rejects a reference to a missing step', () => {
    expect(() => executionWaves([{ id: 'orders', dependsOn: ['users'] }])).toThrow(
      'Step "orders" references step "users", but there is no step with that id.'
    );
  });

  it('rejects a repeated step id', () => {
    expect(() =>
      executionWaves([
        { id: 'users', dependsOn: [] },
        { id: 'users', dependsOn: [] },
      ])
    ).toThrow('Step id "users" is used more than once.');
  });
});
