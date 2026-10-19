import { test, expect } from '@grafana/plugin-e2e';

test('smoke: should render query editor', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml', name: 'Multi Datastore' });
  await panelEditPage.datasource.set(ds.name);
  await expect(panelEditPage.getQueryEditorRow('A').getByRole('textbox', { name: 'Step id' })).toBeVisible();
  await expect(panelEditPage.getQueryEditorRow('A').getByRole('button', { name: 'Add step' })).toBeVisible();
});
