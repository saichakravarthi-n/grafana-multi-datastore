import React from 'react';

import { MagicMock } from '../magicMock';

export interface PickedDatasource {
  uid: string;
  type: string;
}

export const pickedDatasource: PickedDatasource = { uid: 'mysql', type: 'mysql' };

export const getDatasource = new MagicMock<[string], Promise<{ query: jest.Mock }>>();
export const instanceSettings = new MagicMock<[string | undefined], { name?: string } | undefined>();

export function runtimeModule() {
  return {
    getDataSourceSrv: () => ({
      get: (uid: string) => getDatasource.fn(uid),
      getInstanceSettings: (uid?: string) => instanceSettings.fn(uid),
    }),
    DataSourcePicker: ({
      onChange,
      placeholder,
      current,
      filter,
    }: {
      onChange: (datasource: PickedDatasource) => void;
      placeholder?: string;
      current?: string;
      filter?: (datasource: { type?: string; meta?: { id?: string } }) => boolean;
    }) => {
      filter?.({ type: 'mysql', meta: { id: 'prometheus' } });
      filter?.({ type: 'prometheus', meta: { id: 'mysql' } });
      filter?.({ type: 'prometheus', meta: { id: 'prometheus' } });
      filter?.({ type: undefined, meta: undefined });
      return (
        <button type="button" aria-label={placeholder || 'Select a data source'} onClick={() => onChange(pickedDatasource)}>
          {current || placeholder}
        </button>
      );
    },
  };
}
