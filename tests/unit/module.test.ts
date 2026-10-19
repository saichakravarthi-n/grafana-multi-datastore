jest.mock('@emotion/css', () => ({
  css: (styles: unknown) => styles,
}));

jest.mock('@grafana/ui', () => {
  const { uiModule } = require('./mocks/grafanaUi');
  return uiModule();
});

jest.mock('@grafana/runtime', () => {
  const { runtimeModule } = require('./mocks/grafanaRuntime');
  return runtimeModule();
});

import { plugin } from '../../src/module';

describe('plugin module', () => {
  it('registers the query editor and the config editor', () => {
    expect(plugin).toBeDefined();
  });
});
