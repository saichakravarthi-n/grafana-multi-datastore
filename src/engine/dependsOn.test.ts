import { insertDependency, removeDependency, replaceDependency } from './dependsOn';

describe('insertDependency', () => {
  it('starts a query with the IN list', () => {
    expect(insertDependency('', { stepId: 'users', column: 'id' })).toBe('WHERE id IN ({{users.id}})');
  });

  it('adds another list after WHERE', () => {
    expect(insertDependency('SELECT id FROM orders WHERE user_id IN ({{users.id}})', { stepId: 'regions', column: 'id' })).toBe(
      'SELECT id FROM orders WHERE user_id IN ({{users.id}})\n  AND id IN ({{regions.id}})'
    );
  });

  it('adds WHERE when the query has no filter yet', () => {
    expect(insertDependency('SELECT id FROM orders', { stepId: 'users', column: 'id' })).toBe(
      'SELECT id FROM orders\nWHERE id IN ({{users.id}})'
    );
  });

  it('does not insert the same list twice', () => {
    const sql = 'WHERE id IN ({{users.id}})';
    expect(insertDependency(sql, { stepId: 'users', column: 'id' })).toBe(sql);
  });
});

describe('replaceDependency', () => {
  it('keeps the column in front of IN when that column was added with the placeholder', () => {
    expect(replaceDependency('WHERE id IN ({{users.id}})', { stepId: 'users', column: 'id' }, { stepId: 'regions', column: 'code' })).toBe(
      'WHERE code IN ({{regions.code}})'
    );
  });

  it('changes only the placeholder when the filter column is different', () => {
    expect(
      replaceDependency('SELECT sku FROM orders WHERE user_id IN ({{users.id}})', { stepId: 'users', column: 'id' }, { stepId: 'users', column: 'name' })
    ).toBe('SELECT sku FROM orders WHERE user_id IN ({{users.name}})');
  });
});

describe('removeDependency', () => {
  it('removes the only filter', () => {
    expect(removeDependency('SELECT id FROM orders\nWHERE id IN ({{users.id}})', { stepId: 'users', column: 'id' })).toBe(
      'SELECT id FROM orders'
    );
  });

  it('keeps the later filter when the first dependency is removed', () => {
    expect(
      removeDependency('SELECT id FROM orders WHERE user_id IN ({{users.id}}) AND sku IN ({{products.sku}})', {
        stepId: 'users',
        column: 'id',
      })
    ).toBe('SELECT id FROM orders WHERE sku IN ({{products.sku}})');
  });

  it('keeps the earlier filter when a later dependency is removed', () => {
    expect(
      removeDependency('SELECT id FROM orders WHERE user_id IN ({{users.id}})\n  AND id IN ({{regions.id}})', {
        stepId: 'regions',
        column: 'id',
      })
    ).toBe('SELECT id FROM orders WHERE user_id IN ({{users.id}})');
  });
});
