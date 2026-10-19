import {
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  LoadingState,
  TestDataSourceResponse,
  toDataFrame,
} from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { isObservable, lastValueFrom } from 'rxjs';

import { executeSteps } from './engine/execute';
import { MultiDataSourceOptions, MultiQuery, defaultQuery, resolveMaxListSize } from './types';

export class DataSource extends DataSourceApi<MultiQuery, MultiDataSourceOptions> {
  private readonly maxListSize: number;

  constructor(instanceSettings: DataSourceInstanceSettings<MultiDataSourceOptions>) {
    super(instanceSettings);
    this.maxListSize = resolveMaxListSize(instanceSettings.jsonData?.maxListSize);
  }

  getDefaultQuery(): Partial<MultiQuery> {
    return defaultQuery();
  }

  filterQuery(query: MultiQuery): boolean {
    return (query.steps ?? []).some((step) => step.rawSql.trim().length > 0);
  }

  async query(request: DataQueryRequest<MultiQuery>): Promise<DataQueryResponse> {
    const frames: DataFrame[] = [];
    const errors: string[] = [];

    for (const target of request.targets) {
      if (!this.filterQuery(target)) {
        continue;
      }

      try {
        const result = await executeSteps({
          steps: target.steps ?? [],
          maxListSize: this.maxListSize,
          panelRefId: target.refId,
          runQuery: (step, rawSql) => this.runSql(step.datasourceUid, step.datasourceType, rawSql, request),
        });
        frames.push(...result);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    return {
      data: frames,
      state: errors.length > 0 ? LoadingState.Error : LoadingState.Done,
      errors: errors.length > 0 ? errors.map((message) => ({ message })) : undefined,
      error: errors.length > 0 ? { message: errors.join('\n') } : undefined,
    };
  }

  /**
   * This data source has no connection of its own. Save & test only checks that the plugin loaded.
   */
  async testDatasource(): Promise<TestDataSourceResponse> {
    return {
      status: 'success',
      message:
        'Ready. Add MySQL, PostgreSQL, or SQL Server data sources in Grafana, then chain their queries in a panel.',
    };
  }

  private async runSql(
    datasourceUid: string,
    datasourceType: string,
    rawSql: string,
    request: DataQueryRequest<MultiQuery>
  ): Promise<DataFrame[]> {
    const datasource = await getDataSourceSrv().get(datasourceUid);
    const sqlRequest = {
      ...request,
      requestId: `${request.requestId ?? 'multi'}-${datasourceUid}`,
      targets: [
        {
          refId: 'A',
          datasource: { type: datasourceType, uid: datasourceUid },
          rawSql,
          format: 'table',
          editorMode: 'code',
        },
      ],
    } as unknown as DataQueryRequest;
    const result = datasource.query(sqlRequest);
    const response = isObservable(result) ? await lastValueFrom(result) : await result;
    const reported = (response.errors ?? [])
      .map((item) => item.message)
      .filter((message): message is string => !!message);
    // SQL data sources still put the database message on this field.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    if (response.error?.message) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      reported.unshift(response.error.message);
    }

    if (response.state === LoadingState.Error || reported.length > 0) {
      throw new Error(reported.join('\n') || 'The SQL data source returned an error.');
    }

    return (response.data ?? []).map((frame) => toDataFrame(frame));
  }
}
