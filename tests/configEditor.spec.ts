import { test, expect } from '@grafana/plugin-e2e';

test('smoke: should render config editor', async ({ createDataSourceConfigPage, readProvisionedDataSource, page }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml', name: 'Multi Datastore' });
  await createDataSourceConfigPage({ type: ds.type });
  await expect(page.getByLabel('Max list size')).toBeVisible();
});

test('"Save & test" should succeed', async ({ createDataSourceConfigPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml', name: 'Multi Datastore' });
  const configPage = await createDataSourceConfigPage({ type: ds.type });
  await expect(configPage.saveAndTest()).toBeOK();
});
