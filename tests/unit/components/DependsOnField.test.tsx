import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DependsOnField, reconcile } from '../../../src/components/DependsOnField';
import { QueryStep } from '../../../src/types';
import { MagicMock } from '../magicMock';
import { instanceSettings } from '../mocks/grafanaRuntime';

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

function step(partial: Partial<QueryStep> & Pick<QueryStep, 'id'>): QueryStep {
  return {
    datasourceUid: '',
    datasourceType: '',
    rawSql: '',
    hide: false,
    ...partial,
  };
}

describe('DependsOnField', () => {
  beforeEach(() => {
    instanceSettings.reset();
    instanceSettings.mockImplementation((uid?: string) => {
      if (uid === 'throw') {
        throw new Error('settings down');
      }
      if (uid === 'mysql') {
        return { name: 'MySQL' };
      }
      if (uid === 'blank') {
        return { name: '' };
      }
      return undefined;
    });
  });

  it('lists the other step by name and keeps extra columns under that step', () => {
    const onSqlChange = new MagicMock();
    const steps = [
      step({ id: 'users', datasourceUid: 'mysql', datasourceType: 'mysql' }),
      step({ id: 'regions', datasourceUid: 'blank', datasourceType: 'postgres' }),
      step({ id: 'orders', datasourceUid: 'pg', datasourceType: 'prometheus' }),
    ];

    render(
      <DependsOnField
        steps={steps}
        stepIndex={2}
        sql={'SELECT 1 WHERE user_id IN ({{users.id}}) AND region_id IN ({{regions.code}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Depends on step 1' })).toHaveValue('users');
    expect(screen.getByRole('combobox', { name: 'Depends on step 2' })).toHaveValue('regions');
    expect(screen.getByRole('option', { name: 'users (MySQL)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'regions (PostgreSQL)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'orders' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Add column' })[0]);
    const added = screen.getByRole('textbox', { name: 'Depends on column 2 of step 1' });
    fireEvent.change(added, { target: { value: 'name' } });
    fireEvent.blur(added);

    expect(onSqlChange.callArgsList.at(-1)?.[0]).toContain('{{users.name}}');
    onSqlChange.assertCalled();
  });

  it('asks for a step and a real column, and rejects a repeated column', () => {
    const onSqlChange = new MagicMock();
    const steps = [step({ id: 'users' }), step({ id: 'orders' })];
    const { rerender } = render(<DependsOnField steps={steps} stepIndex={1} sql="" onSqlChange={onSqlChange.fn} />);

    const column = screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' });
    fireEvent.change(column, { target: { value: 'id' } });
    fireEvent.blur(column);
    expect(screen.getByText('Choose the step this one depends on.')).toBeInTheDocument();
    onSqlChange.assertNotCalled();

    fireEvent.change(column, { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Depends on step 1' }), { target: { value: 'users' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' }), { target: { value: '1bad' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' }));
    expect(screen.getByText('Use a column name such as id.')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' }), { target: { value: 'id' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' }));
    rerender(<DependsOnField steps={steps} stepIndex={1} sql={String(onSqlChange.callArgsList.at(-1)?.[0])} onSqlChange={onSqlChange.fn} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }));
    const second = screen.getByRole('textbox', { name: 'Depends on column 2 of step 1' });
    fireEvent.change(second, { target: { value: 'id' } });
    fireEvent.blur(second);
    expect(screen.getByText('That column is already listed for this step.')).toBeInTheDocument();
  });

  it('moves every column when the step changes, and clears them when the step is removed', () => {
    const onSqlChange = new MagicMock();
    const { rerender } = render(
      <DependsOnField
        steps={[
          step({ id: 'users', datasourceUid: 'throw', datasourceType: 'mysql' }),
          step({ id: 'regions', datasourceType: 'mssql' }),
          step({ id: 'orders' }),
        ]}
        stepIndex={2}
        sql={'WHERE id IN ({{users.id}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Depends on step 1' }), { target: { value: 'regions' } });
    expect(onSqlChange.callArgsList.at(-1)?.[0]).toContain('{{regions.id}}');
    expect(onSqlChange.callArgsList.at(-1)?.[0]).not.toContain('{{users.id}}');

    rerender(
      <DependsOnField
        steps={[step({ id: 'users' }), step({ id: 'regions' }), step({ id: 'orders' })]}
        stepIndex={2}
        sql={String(onSqlChange.callArgsList.at(-1)?.[0])}
        onSqlChange={onSqlChange.fn}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Depends on step 1' }), { target: { value: '' } });
    expect(onSqlChange.callArgsList.at(-1)?.[0]).not.toContain('{{regions.id}}');
  });

  it('removes one column and a whole step dependency', () => {
    const onSqlChange = new MagicMock();
    render(
      <DependsOnField
        steps={[step({ id: 'users' }), step({ id: 'gone' }), step({ id: 'orders' })]}
        stepIndex={2}
        sql={'WHERE user_id IN ({{users.id}}) AND name IN ({{users.name}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove column 2 of step 1' }));
    expect(onSqlChange.callArgsList.at(-1)?.[0]).not.toContain('{{users.name}}');
    expect(onSqlChange.callArgsList.at(-1)?.[0]).toContain('{{users.id}}');

    fireEvent.click(screen.getByRole('button', { name: 'Remove dependency 1' }));
    expect(onSqlChange.callArgsList.at(-1)?.[0]).not.toContain('{{users.id}}');

    fireEvent.click(screen.getByRole('button', { name: 'Depends on another step' }));
    expect(screen.getAllByRole('combobox', { name: /Depends on step/ })).toHaveLength(2);
  });

  it('skips a typed column that is already saved when the step changes', () => {
    const onSqlChange = new MagicMock();
    render(
      <DependsOnField
        steps={[step({ id: 'users' }), step({ id: 'bad-name' }), step({ id: 'regions' }), step({ id: 'orders' })]}
        stepIndex={3}
        sql={'WHERE id IN ({{users.id}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    expect(screen.queryByRole('option', { name: 'bad-name' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }));
    const extra = screen.getByRole('textbox', { name: 'Depends on column 2 of step 1' });
    fireEvent.change(extra, { target: { value: 'id' } });
    fireEvent.blur(extra);
    fireEvent.change(screen.getByRole('combobox', { name: 'Depends on step 1' }), { target: { value: 'regions' } });
    expect(onSqlChange.callArgsList.at(-1)?.[0]).toContain('{{regions.id}}');
    expect(onSqlChange.callArgsList.at(-1)?.[0]).not.toContain('{{users.id}}');
  });

  it('renames a column that is already saved', () => {
    const onSqlChange = new MagicMock();
    render(
      <DependsOnField
        steps={[step({ id: 'users' }), step({ id: 'orders' })]}
        stepIndex={1}
        sql={'WHERE id IN ({{users.id}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    const column = screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' });
    fireEvent.change(column, { target: { value: 'name' } });
    fireEvent.blur(column);
    expect(onSqlChange.callArgsList.at(-1)?.[0]).toContain('{{users.name}}');
  });

  it('shows a step that is no longer in the list and a field error', () => {
    render(
      <DependsOnField
        steps={[step({ id: 'orders' })]}
        stepIndex={0}
        sql={'WHERE id IN ({{users.id}})'}
        error="There is no step named users."
        onSqlChange={new MagicMock().fn}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Depends on step 1' })).toHaveValue('users');
    expect(screen.getByText('There is no step named users.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Add the other step first.' })).toBeInTheDocument();
  });

  it('keeps a column when the form did not already know that step', () => {
    const groups = reconcile([], 'WHERE id IN ({{users.id}})');
    expect(groups[0]?.stepId).toBe('users');
    expect(groups[0]?.columns[0]?.column).toBe('id');
  });

  it('updates one step while another step stays in the form', () => {
    const onSqlChange = new MagicMock();
    render(
      <DependsOnField
        steps={[
          step({ id: 'users', datasourceUid: '', datasourceType: 'prometheus' }),
          step({ id: 'regions', datasourceUid: 'mysql', datasourceType: 'mysql' }),
          step({ id: 'extra', datasourceUid: 'mysql', datasourceType: 'mysql' }),
          step({ id: 'orders' }),
        ]}
        stepIndex={3}
        sql={'WHERE id IN ({{users.id}}) AND code IN ({{regions.code}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    expect(screen.getByRole('option', { name: 'users' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'regions (MySQL)' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Depends on step 1' }), { target: { value: 'extra' } });
    expect(onSqlChange.callArgsList.at(-1)?.[0]).toContain('{{extra.id}}');
  });

  it('clears a step that still has an unsaved column', () => {
    const onSqlChange = new MagicMock();
    render(
      <DependsOnField
        steps={[step({ id: 'users' }), step({ id: 'regions' }), step({ id: 'orders' })]}
        stepIndex={2}
        sql={'WHERE id IN ({{users.id}}) AND code IN ({{regions.code}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Add column' })[0]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Depends on step 1' }), { target: { value: '' } });
    expect(onSqlChange.callArgsList.at(-1)?.[0]).not.toContain('{{users.id}}');
    expect(onSqlChange.callArgsList.at(-1)?.[0]).toContain('{{regions.code}}');
  });

  it('clears one saved column while another column and another step stay', () => {
    const onSqlChange = new MagicMock();
    render(
      <DependsOnField
        steps={[step({ id: 'users' }), step({ id: 'regions' }), step({ id: 'orders' })]}
        stepIndex={2}
        sql={'WHERE id IN ({{users.id}}) AND name IN ({{users.name}}) AND code IN ({{regions.code}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    const column = screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' });
    fireEvent.change(column, { target: { value: '' } });
    fireEvent.blur(column);
    expect(onSqlChange.callArgsList.at(-1)?.[0]).not.toContain('{{users.id}}');
    expect(onSqlChange.callArgsList.at(-1)?.[0]).toContain('{{users.name}}');
  });

  it('leaves a blank new column in place and rejects a repeated name', () => {
    const onSqlChange = new MagicMock();
    render(
      <DependsOnField
        steps={[step({ id: 'users' }), step({ id: 'regions' }), step({ id: 'orders' })]}
        stepIndex={2}
        sql={'WHERE id IN ({{users.id}}) AND code IN ({{regions.code}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Add column' })[0]);
    fireEvent.blur(screen.getByRole('textbox', { name: 'Depends on column 2 of step 1' }));
    onSqlChange.assertNotCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Depends on column 2 of step 1' }), { target: { value: 'id' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Depends on column 2 of step 1' }));
    expect(screen.getByText('That column is already listed for this step.')).toBeInTheDocument();
  });

  it('removes the only column of one step and an unsaved column', () => {
    const onSqlChange = new MagicMock();
    render(
      <DependsOnField
        steps={[step({ id: 'users' }), step({ id: 'regions' }), step({ id: 'orders' })]}
        stepIndex={2}
        sql={'WHERE id IN ({{users.id}}) AND code IN ({{regions.code}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove column 1 of step 1' }));
    expect(onSqlChange.callArgsList.at(-1)?.[0]).not.toContain('{{users.id}}');

    fireEvent.click(screen.getAllByRole('button', { name: 'Add column' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove column 2 of step 1' }));
    expect(screen.queryByRole('textbox', { name: 'Depends on column 2 of step 1' })).not.toBeInTheDocument();
  });

  it('removes a whole step that still has an unsaved column', () => {
    const onSqlChange = new MagicMock();
    render(
      <DependsOnField
        steps={[step({ id: 'users' }), step({ id: 'regions' }), step({ id: 'orders' })]}
        stepIndex={2}
        sql={'WHERE id IN ({{users.id}}) AND code IN ({{regions.code}})'}
        onSqlChange={onSqlChange.fn}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Add column' })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Depends on column 2 of step 1' }), { target: { value: 'name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove dependency 1' }));
    expect(onSqlChange.callArgsList.at(-1)?.[0]).not.toContain('{{users.id}}');
    expect(onSqlChange.callArgsList.at(-1)?.[0]).toContain('{{regions.code}}');
  });

  it('ignores a blank column and drops a saved column that is cleared', () => {
    const onSqlChange = new MagicMock();
    const { rerender } = render(
      <DependsOnField steps={[step({ id: 'users' }), step({ id: 'orders' })]} stepIndex={1} sql="" onSqlChange={onSqlChange.fn} />
    );

    fireEvent.blur(screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' }));
    onSqlChange.assertNotCalled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Depends on step 1' }), { target: { value: 'users' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' }), { target: { value: 'id' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' }));
    const saved = String(onSqlChange.callArgsList.at(-1)?.[0]);
    rerender(
      <DependsOnField steps={[step({ id: 'users' }), step({ id: 'orders' })]} stepIndex={1} sql={saved} onSqlChange={onSqlChange.fn} />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' }), { target: { value: '' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Depends on column 1 of step 1' }));
    expect(onSqlChange.callArgsList.at(-1)?.[0]).not.toContain('{{users.id}}');
  });
});
