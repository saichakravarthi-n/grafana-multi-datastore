# Multi Datastore

Run a MySQL, PostgreSQL, or SQL Server query, then pass a column from that result into the next database, all inside one panel.

Each step uses a SQL data source you already configured in Grafana. This plugin does not store a database host, user, or password. If a later step contains a placeholder, the earlier step runs first and the placeholder becomes one comma-separated list of values.

```sql
-- step id: users, data source: MySQL
SELECT id FROM users WHERE active = 1

-- step id: orders, data source: PostgreSQL
SELECT id, user_id, sku FROM orders WHERE user_id IN ({{users.id}})
```

`{{users.id}}` means: run the step named `users`, take the distinct values of column `id`, and paste them here. When that column contains `1` and `2`, the second query is sent as `WHERE user_id IN (1, 2)`. The second query runs once, not once per row.

## Before you start

1. Use Grafana 13.2 or later.
2. Add the databases you want to query as normal Grafana data sources, and confirm each one works on its own. Supported types are MySQL, PostgreSQL, and Microsoft SQL Server.
3. You need permission to query those data sources. This plugin runs them with your Grafana user.

## Add the data source

1. Open **Administration**, then **Plugins and data**, then **Plugins**.
2. Open **Multi Datastore** and click **Add new data source**.
3. Optionally set **Max list size**. The default is 1000. That is the most distinct values one placeholder may insert. A longer list fails the query instead of sending a huge `IN` clause.
4. Click **Save & test**. Success means the plugin loaded. It does not open a database connection of its own.

## Use it in a panel

1. Edit a dashboard and add a visualization. A **Table** is the usual choice.
2. Choose the **Multi Datastore** data source.
3. Fill in the first step:
   - **Name** is what later steps call this step. Use letters, numbers, and underscores, and start with a letter or underscore. Example: `users`.
   - **Database** is one MySQL, PostgreSQL, or SQL Server source already configured in Grafana.
   - **Depends on** is where you say which step this one depends on. Leave it empty when this step runs first. For a later step, choose the earlier step, such as `users`, then add each column you need, such as `id` and `name`. That writes `IN ({{users.id}})` into the SQL. Use **Depends on another step** only when this step also reads a different step.
   - **SQL** is the query for that database. The **Depends on** lines are already in it, and you can edit the rest.
   - **Show these rows in the panel** controls whether this step's rows appear in the panel. Turn it off when the step only supplies values for a later step.
4. Click **Add step** and repeat for the next database.
5. Refresh the panel.

The box at the top, **Which database runs first**, lists the steps in run order. A step with an empty **Depends on** runs first. A step that names another step waits for that step.

A hidden step still runs when a later step reads one of its columns. If more than one step has **Show in panel** turned on, the panel shows each of those results.

## How to pass values

Put the placeholder inside `IN (...)`. The placeholder itself is only the list of values.

| You write | What is sent |
| --- | --- |
| `IN ({{users.id}})` and the column contains `1`, `2`, `2` | `IN (1, 2)` |
| `IN ({{users.name}})` and the column contains `Ada` and `O'Brien` | `IN ('Ada', 'O''Brien')` |
| `IN ({{users.id}})` and the column has no values | `IN (NULL)`, which returns no rows |

Rules:

- Numbers stay unquoted. Strings are quoted, and a quote inside a value is doubled.
- Duplicate values are removed. Nulls are skipped.
- `{{users.id}}` is the whole column. It does not keep two columns paired. `IN ({{users.id}})` and `IN ({{users.name}})` are two separate lists.
- Dashboard variables such as `$customer`, and Grafana macros such as `$__timeFilter(time)`, are left as they are. Only `{{step.column}}` is replaced, then the selected SQL data source runs the query.
- Steps that do not depend on each other run at the same time. A step waits only for the steps named in **Depends on**.

## When a query stops

The panel status icon shows the reason, and the message names the step.

- **Cycle.** If `users` reads `orders` and `orders` reads `users`, neither query runs. The message is `Steps "users" and "orders" depend on each other.`
- **Unknown step.** `{{missing.id}}` fails when there is no step named `missing`.
- **Missing column.** The query fails when the earlier step did not return that column.
- **List too long.** The query fails when a placeholder would insert more values than **Max list size**.
- **Bad step id.** The id must start with a letter or underscore and then use only letters, numbers, and underscores. `{{step.column}}` is the only placeholder form. `{{users}}` is rejected.

## Demo

The Docker development stack includes a MySQL `users` table and a PostgreSQL `orders` table. Open the dashboard **Multi datastore demo**. It has three panels:

- **Orders for active users** shows only orders whose `user_id` came from the active MySQL users.
- **Dependency cycle** shows the cycle error.
- **Value list over the limit** uses a data source whose max list size is 1, so two user ids are rejected.

## Limit

This data source cannot drive Grafana alert rules. The chain runs in the browser, and alerting runs on the Grafana server.
