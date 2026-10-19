import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { QueryEditor } from '../../../src/components/QueryEditor';
import { QueryStep } from '../../../src/types';
import { MagicMock } from '../magicMock';
import { pickedDatasource } from '../mocks/grafanaRuntime';

jest.mock('@emotion/css', () => ({
  css: (styles: unknown) => styles,
}));

jest.mock('@grafana/ui', () => {
  const { uiModule } = require('../mocks/grafanaUi');
  return uiModule();
});

jest.mock('@grafana/runtime', () => {
  const { runtimeModule } = require('../mocks/grafanaRuntime');
  return runtimeModule();
});

function editor(steps: QueryStep[] | undefined, onChange = new MagicMock(), onRunQuery = new MagicMock()) {
  const query = { refId: 'A', steps } as never;
  const view = render(<QueryEditor query={query} onChange={onChange.fn} onRunQuery={onRunQuery.fn} datasource={{} as never} />);
  return { onChange, onRunQuery, ...view };
}

function step(partial: Partial<QueryStep> & Pick<QueryStep, 'id'>): QueryStep {
  return {
    datasourceUid: 'mysql',
    datasourceType: 'mysql',
    rawSql: 'SELECT 1',
    hide: false,
    ...partial,
  };
}

describe('QueryEditor', () => {
  beforeEach(() => {
    pickedDatasource.uid = 'mysql';
    pickedDatasource.type = 'mysql';
  });

  it('starts from one empty step when the query has none', () => {
    editor(undefined);
    expect(screen.getByRole('textbox', { name: 'Step id' })).toHaveValue('step1');
    expect(screen.getByText('step1 (this database).')).toBeInTheDocument();
  });

  it('labels a step that has no name yet', () => {
    editor([step({ id: '  ' })]);
    expect(screen.getByRole('heading', { name: 'Step 1' })).toBeInTheDocument();
  });

  it('lists a ready step before a step that is still waiting', () => {
    editor([
      step({ id: 'orders', rawSql: 'SELECT 1 WHERE id IN ({{gone.id}})' }),
      step({ id: 'users', rawSql: 'SELECT id FROM users', hide: true }),
    ]);
    expect(screen.getByText('users (MySQL).')).toBeInTheDocument();
    expect(screen.getByText('orders (MySQL) depends on gone.')).toBeInTheDocument();
  });

  it('waits for a valid name before it shows the run order', () => {
    editor([step({ id: 'bad-name', rawSql: '', datasourceUid: '' })]);
    expect(screen.getByText('The run order appears here after each step has its own name.')).toBeInTheDocument();
  });

  it('shows which step runs first and which step waits', () => {
    editor([
      step({ id: 'users', rawSql: 'SELECT id FROM users', hide: true }),
      step({
        id: 'regions',
        datasourceType: 'postgres',
        rawSql: 'SELECT id FROM regions',
        hide: true,
      }),
      step({
        id: 'orders',
        datasourceType: 'grafana-postgresql-datasource',
        rawSql: 'SELECT 1 WHERE user_id IN ({{users.id}}) AND region_id IN ({{regions.id}})',
      }),
      step({
        id: 'late',
        datasourceType: 'mssql',
        rawSql: 'SELECT 1 WHERE id IN ({{orders.id}})',
        hide: true,
      }),
      step({
        id: 'last',
        datasourceType: 'grafana-mssql-datasource',
        rawSql: 'SELECT 1 WHERE id IN ({{late.id}})',
        hide: true,
      }),
    ]);

    expect(screen.getByText('users (MySQL).')).toBeInTheDocument();
    expect(screen.getByText('orders (PostgreSQL) depends on users and regions.')).toBeInTheDocument();
    expect(screen.getByText('Runs 3rd on SQL Server. Depends on orders. Add that step first.')).toBeInTheDocument();
    expect(screen.getByText('Runs 4th on SQL Server. Depends on late. Add that step first.')).toBeInTheDocument();
  });

  it('says which missing step to add first', () => {
    editor([
      step({ id: 'orders', datasourceType: 'prometheus', rawSql: 'SELECT 1 WHERE id IN ({{gone.id}}) AND sku IN ({{also.sku}})' }),
    ]);

    expect(screen.getByText('orders (this database) depends on gone and also.')).toBeInTheDocument();
    expect(screen.getByText('Depends on gone and also. Add that step first.')).toBeInTheDocument();
    expect(screen.getByText(/There is no step named "gone"/)).toBeInTheDocument();
  });

  it('edits the name, database, visibility, and SQL, and runs a valid query', () => {
    const { onChange, onRunQuery } = editor([step({ id: 'users', datasourceUid: '', rawSql: '' })]);

    fireEvent.change(screen.getByRole('textbox', { name: 'Step id' }), { target: { value: 'people' } });
    expect(onChange.callArgsList.at(-1)?.[0].steps[0].id).toBe('people');

    fireEvent.click(screen.getByRole('button', { name: 'Choose a database' }));
    expect(onChange.callArgsList.at(-1)?.[0].steps[0].datasourceUid).toBe('mysql');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show in panel' }));
    expect(onChange.callArgsList.at(-1)?.[0].steps[0].hide).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: 'SQL editor' }), { target: { value: 'SELECT id FROM users' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'SQL editor' }), { target: { value: 'SELECT id FROM users' } });
    onRunQuery.assertNotCalled();
  });

  it('writes the chosen step into the SQL', () => {
    const { onChange } = editor([
      step({ id: 'users', rawSql: 'SELECT id FROM users', hide: true }),
      step({ id: 'orders', rawSql: 'SELECT 1' }),
    ]);
    fireEvent.change(screen.getAllByRole('combobox', { name: 'Depends on step 1' })[1], { target: { value: 'users' } });
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Depends on column 1 of step 1' })[1], { target: { value: 'id' } });
    fireEvent.blur(screen.getAllByRole('textbox', { name: 'Depends on column 1 of step 1' })[1]);
    expect(onChange.callArgsList.at(-1)?.[0].steps[1].rawSql).toContain('{{users.id}}');
  });

  it('runs the query after a complete step is saved', () => {
    const { onRunQuery } = editor([step({ id: 'users', rawSql: 'SELECT 1' })]);
    fireEvent.blur(screen.getByRole('textbox', { name: 'SQL editor' }), { target: { value: 'SELECT 1' } });
    onRunQuery.assertCalledOnce();
  });

  it('adds the next step, skips a name that is already used, and removes steps', () => {
    const { onChange, rerender } = editor([step({ id: 'step1', rawSql: '' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    let steps = onChange.callArgsList.at(-1)?.[0].steps;
    expect(steps.map((item: QueryStep) => item.id)).toEqual(['step1', 'step2']);
    expect(steps[0].hide).toBe(true);

    steps = [
      step({ id: 'step1', rawSql: '', hide: false }),
      step({ id: 'step3', rawSql: '', hide: false }),
    ];
    rerender(
      <QueryEditor
        query={{ refId: 'A', steps } as never}
        onChange={onChange.fn}
        onRunQuery={new MagicMock().fn}
        datasource={{} as never}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    steps = onChange.callArgsList.at(-1)?.[0].steps;
    expect(steps.map((item: QueryStep) => item.id)).toContain('step4');
    expect(steps[0].hide).toBe(false);

    rerender(
      <QueryEditor query={{ refId: 'A', steps } as never} onChange={onChange.fn} onRunQuery={new MagicMock().fn} datasource={{} as never} />
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove step' })[0]);
    steps = onChange.callArgsList.at(-1)?.[0].steps;
    expect(steps).toHaveLength(2);

    rerender(
      <QueryEditor
        query={{ refId: 'A', steps: [step({ id: 'only', rawSql: 'SELECT 1' })] } as never}
        onChange={onChange.fn}
        onRunQuery={new MagicMock().fn}
        datasource={{} as never}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove step' }));
    expect(onChange.callArgsList.at(-1)?.[0].steps[0].id).toBe('step1');
  });

  it('shows the last remaining step when every other step is hidden', () => {
    const { onChange } = editor([
      step({ id: 'users', hide: true }),
      step({ id: 'orders', rawSql: 'SELECT 1 WHERE id IN ({{users.id}})' }),
    ]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove step' })[1]);
    expect(onChange.callArgsList.at(-1)?.[0].steps[0].hide).toBe(false);
  });

  it('warns when every step is hidden', () => {
    editor([step({ id: 'users', hide: true }), step({ id: 'orders', hide: true })]);
    expect(screen.getByRole('alert')).toHaveTextContent('Show these rows in the panel');
  });
});
