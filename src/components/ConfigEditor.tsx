import React, { ChangeEvent } from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { InlineField, Input } from '@grafana/ui';

import { DEFAULT_MAX_LIST_SIZE, MultiDataSourceOptions, resolveMaxListSize } from '../types';

type Props = DataSourcePluginOptionsEditorProps<MultiDataSourceOptions>;

export function ConfigEditor({ options, onOptionsChange }: Props) {
  const onMaxListSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.currentTarget.value);
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        maxListSize: Number.isInteger(next) && next >= 1 ? next : DEFAULT_MAX_LIST_SIZE,
      },
    });
  };

  return (
    <InlineField
      label="Max list size"
      labelWidth={18}
      tooltip="Maximum number of distinct values inserted for one {{step.column}} placeholder. The query fails instead of sending a longer IN list."
    >
      <Input
        id="config-editor-max-list-size"
        aria-label="Max list size"
        type="number"
        min={1}
        step={1}
        width={16}
        value={resolveMaxListSize(options.jsonData.maxListSize)}
        onChange={onMaxListSizeChange}
      />
    </InlineField>
  );
}
