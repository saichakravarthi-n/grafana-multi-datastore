import { parsePlaceholders } from './parse';

describe('parsePlaceholders', () => {
  it('reads unique step and column references', () => {
    expect(parsePlaceholders('WHERE id IN ({{users.id}}) AND id IN ({{ users.id }}) OR name IN ({{users.name}})')).toEqual({
      refs: [
        { stepId: 'users', column: 'id' },
        { stepId: 'users', column: 'name' },
      ],
      errors: [],
    });
  });

  it('rejects placeholders that are not step.column', () => {
    expect(parsePlaceholders('{{users}} {{1bad.col}} {{users.bad-name}}').errors).toEqual([
      'Invalid placeholder "{{users}}". Use {{step.column}}.',
      'Invalid placeholder "{{1bad.col}}". Use {{step.column}}.',
      'Invalid placeholder "{{users.bad-name}}". Use {{step.column}}.',
    ]);
  });

  it('returns no refs for SQL without placeholders', () => {
    expect(parsePlaceholders('SELECT id FROM users WHERE active = 1')).toEqual({ refs: [], errors: [] });
  });
});
