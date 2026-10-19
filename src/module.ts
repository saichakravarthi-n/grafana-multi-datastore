import { DataSourcePlugin } from '@grafana/data';

import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { DataSource } from './datasource';
import { MultiDataSourceOptions, MultiQuery } from './types';

export const plugin = new DataSourcePlugin<DataSource, MultiQuery, MultiDataSourceOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
