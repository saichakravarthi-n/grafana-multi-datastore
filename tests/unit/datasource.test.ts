import { DataSourceInstanceSettings, LoadingState } from '@grafana/data';
import { of } from 'rxjs';

import { DataSource } from '../../src/datasource';
import { MultiDataSourceOptions, MultiQuery } from '../../src/types';
import { MagicMock } from './magicMock';
import { getDatasource } from './mocks/grafanaRuntime';

jest.mock('@grafana/runtime', () => {
  const { runtimeModule } = require('./mocks/grafanaRuntime');
  return runtimeModule();
});

function settings(maxListSize?: number): DataSourceInstanceSettings<MultiDataSourceOptions> {
  return {
    id: 1,
    uid: 'multi',
    type: 'local-multidatastore-datasource',
    name: 'Multi Datastore',
    jsonData: { maxListSize },
    meta: { id: 'local-multidatastore-datasource' },
    access: 'proxy',
    readOnly: false,
  } as DataSourceInstanceSettings<MultiDataSourceOptions>;
}

function request(targets: MultiQuery[], requestId?: string) {
  return {
    requestId,
    targets,
    range: { from: 'now-1h', to: 'now' },
  } as never;
}

describe('DataSource', () => {
  beforeEach(() => {
    getDatasource.reset();
  });

  it('reports that the plugin is ready without opening a database', async () => {
    const source = new DataSource(settings());
    await expect(source.testDatasource()).resolves.toEqual({
      status: 'success',
      message: 'Ready. Add MySQL, PostgreSQL, or SQL Server data sources in Grafana, then chain their queries in a panel.',
    });
    expect(source.getDefaultQuery().steps).toHaveLength(1);
    expect(source.filterQuery({ refId: 'A', steps: [{ id: 'users', datasourceUid: '', datasourceType: '', rawSql: '  ', hide: false }] })).toBe(
      false
    );
  });

  it('skips an empty target and returns rows from a promise response', async () => {
    const query = new MagicMock();
    query.mockResolvedValue({
      state: LoadingState.Done,
      data: [{ fields: [{ name: 'id', values: [1] }], length: 1, meta: { executedQueryString: 'SELECT 1' } }],
    });
    getDatasource.mockResolvedValue({ query: query.fn });
    const source = new DataSource(settings(10));

    const response = await source.query(
      request(
        [
          { refId: 'A' },
          {
            refId: 'B',
            steps: [
              {
                id: 'users',
                datasourceUid: 'mysql',
                datasourceType: 'mysql',
                rawSql: 'SELECT id FROM users',
                hide: false,
              },
            ],
          },
        ],
        'panel'
      )
    );

    expect(response.state).toBe(LoadingState.Done);
    expect(response.error).toBeUndefined();
    expect(response.data).toHaveLength(1);
    query.assertCalledOnce();
    expect(query.callArgsList[0][0].requestId).toBe('panel-mysql');
  });

  it('reads an observable response and a database error on the legacy field', async () => {
    const query = new MagicMock();
    query.mockReturnValue(
      of({
        state: LoadingState.Done,
        errors: [{ message: '' }, { message: 'timeout' }],
        error: { message: 'connection refused' },
        data: undefined,
      })
    );
    getDatasource.mockResolvedValue({ query: query.fn });
    const source = new DataSource(settings('nope' as never));

    const response = await source.query(
      request([
        {
          refId: 'A',
          steps: [{ id: 'users', datasourceUid: 'mysql', datasourceType: 'mysql', rawSql: 'SELECT 1', hide: false }],
        },
      ])
    );

    expect(response.state).toBe(LoadingState.Error);
    expect(response.error?.message).toContain('connection refused');
    expect(response.error?.message).toContain('timeout');
    expect(query.callArgsList[0][0].requestId).toBe('multi-mysql');
  });

  it('names the step when the SQL data source fails without a message', async () => {
    const query = new MagicMock();
    query.mockResolvedValue({ state: LoadingState.Error, data: [] });
    getDatasource.mockResolvedValue({ query: query.fn });
    const source = new DataSource(settings());

    const response = await source.query(
      request([
        {
          refId: 'A',
          steps: [{ id: 'users', datasourceUid: 'mysql', datasourceType: 'mysql', rawSql: 'SELECT 1', hide: false }],
        },
      ])
    );

    expect(response.errors?.[0].message).toBe('Step "users" failed: The SQL data source returned an error.');
  });

  it('returns no rows when the SQL data source omits the frame list', async () => {
    const query = new MagicMock();
    query.mockResolvedValue({ state: LoadingState.Done });
    getDatasource.mockResolvedValue({ query: query.fn });
    const source = new DataSource(settings());

    const response = await source.query(
      request([
        {
          refId: 'A',
          steps: [{ id: 'users', datasourceUid: 'mysql', datasourceType: 'mysql', rawSql: 'SELECT 1', hide: false }],
        },
      ])
    );

    expect(response.state).toBe(LoadingState.Done);
    expect(response.data).toEqual([]);
  });

  it('runs a target the filter accepts even when its step list is empty, and allows a response without frames', async () => {
    const query = new MagicMock();
    query.mockResolvedValue({ state: LoadingState.Done });
    getDatasource.mockResolvedValue({ query: query.fn });
    const source = new DataSource(settings());
    jest.spyOn(source, 'filterQuery').mockReturnValue(true);

    const response = await source.query(request([{ refId: 'A' }]));

    expect(response.state).toBe(LoadingState.Error);
    expect(response.data).toEqual([]);
  });

  it('stringifies a failure that is not an Error', async () => {
    getDatasource.mockRejectedValue('offline');
    const source = new DataSource(settings());

    const response = await source.query(
      request([
        {
          refId: 'A',
          steps: [{ id: 'users', datasourceUid: 'mysql', datasourceType: 'mysql', rawSql: 'SELECT 1', hide: false }],
        },
      ])
    );

    expect(response.error?.message).toBe('Step "users" failed: offline');
  });
});
