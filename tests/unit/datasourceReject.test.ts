import { DataSourceInstanceSettings } from '@grafana/data';

import { DataSource } from '../../src/datasource';
import { MultiDataSourceOptions } from '../../src/types';

jest.mock('../../src/engine/execute', () => ({
  executeSteps: () => Promise.reject('offline'),
}));

jest.mock('@grafana/runtime', () => {
  const { runtimeModule } = require('./mocks/grafanaRuntime');
  return runtimeModule();
});

describe('DataSource when execution fails with a plain value', () => {
  it('turns that value into the panel error', async () => {
    const source = new DataSource({
      id: 1,
      uid: 'multi',
      type: 'ucn-multidatastore-datasource',
      name: 'Multi Datastore',
      jsonData: {},
      meta: { id: 'ucn-multidatastore-datasource' },
      access: 'proxy',
      readOnly: false,
    } as DataSourceInstanceSettings<MultiDataSourceOptions>);

    const response = await source.query({
      targets: [
        {
          refId: 'A',
          steps: [{ id: 'users', datasourceUid: 'mysql', datasourceType: 'mysql', rawSql: 'SELECT 1', hide: false }],
        },
      ],
    } as never);

    expect(response.error?.message).toBe('offline');
  });
});
