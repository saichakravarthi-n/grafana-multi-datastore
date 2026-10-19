import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ConfigEditor } from '../../../src/components/ConfigEditor';
import { MagicMock } from '../magicMock';

jest.mock('@grafana/ui', () => {
  const { uiModule } = require('../mocks/grafanaUi');
  return uiModule();
});

describe('ConfigEditor', () => {
  it('keeps a whole number and resets anything else to 1000', () => {
    const onOptionsChange = new MagicMock();
    const options = { jsonData: { maxListSize: 25 } } as never;
    render(<ConfigEditor options={options} onOptionsChange={onOptionsChange.fn} />);

    const input = screen.getByRole('textbox', { name: 'Max list size' });
    expect(input).toHaveValue('25');

    fireEvent.change(input, { target: { value: '8' } });
    onOptionsChange.assertCalled();
    expect(onOptionsChange.callArgsList.at(-1)?.[0].jsonData.maxListSize).toBe(8);

    fireEvent.change(input, { target: { value: '0' } });
    expect(onOptionsChange.callArgsList.at(-1)?.[0].jsonData.maxListSize).toBe(1000);
  });
});
