# Multi Datastore

Grafana data source plugin that runs MySQL, PostgreSQL, and SQL Server queries in dependency order. A later step can read a column from an earlier step with `{{step.column}}`. That placeholder becomes one comma-separated list, so `WHERE user_id IN ({{users.id}})` runs a single query. The plugin does not store database passwords. Each step uses a SQL data source already configured in Grafana.

`docker compose up` starts Grafana with a demo MySQL `users` table and a PostgreSQL `orders` table. The provisioned dashboard "Multi datastore demo" shows orders for active users, a dependency cycle, and a value list that is over the configured limit.

## Getting started

### Frontend

1. Install dependencies

   ```bash
   npm install
   ```

2. Build plugin in development mode and run in watch mode

   ```bash
   npm run dev
   ```

3. Build plugin in production mode

   ```bash
   npm run build
   ```

4. Run the tests (using Jest)

   ```bash
   # Runs the tests and watches for changes, requires git init first
   npm run test

   # Exits after running all the tests
   npm run test:ci
   ```

5. Spin up a Grafana instance and run the plugin inside it (using Docker)

   ```bash
   npm run server
   ```

6. Run the E2E tests (using Playwright)

   ```bash
   # Spins up a Grafana instance first that we tests against
   npm run server

   # If you wish to start a certain Grafana version. If not specified will use latest by default
   GRAFANA_VERSION=11.3.0 npm run server

   # Starts the tests
   npm run e2e
   ```

7. Run the linter

   ```bash
   npm run lint

   # or

   npm run lint:fix
   ```

# Publishing

Grafana signs a new catalog plugin after it approves the submission. Leave the build unsigned until Grafana assigns a signature level.

Signing uses a Grafana Cloud access policy token with the `plugins:write` scope. Create it under **My Account > Security > Access Policies**, realm set to the organization, then:

```bash
export GRAFANA_ACCESS_POLICY_TOKEN=<token>
npm run build
npm run sign
```

The plugin id already starts with the organization slug `ucn`. Public signing is available only after Grafana approves the plugin. Development in this repository loads the unsigned build through Docker.

## Learn more

Below you can find source code for existing app plugins and other related documentation.

- [Basic data source plugin example](https://github.com/grafana/grafana-plugin-examples/tree/master/examples/datasource-basic#readme)
- [`plugin.json` documentation](https://grafana.com/developers/plugin-tools/reference/plugin-json)
- [How to sign a plugin?](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin)
