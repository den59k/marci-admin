# marci-admin

[![NPM version](https://img.shields.io/npm/v/marci-admin)](https://www.npmjs.com/package/marci-admin)

A headless admin panel framework for [Bun](https://bun.sh), built as a plugin for the [`@den59k/marci`](https://github.com/den59k/marci) web framework. You define pages with a fluent builder API; `marci-admin` handles routing, auth, and serves a built-in Vue 3 UI.

> **Status:** early development, API may change between versions.


---

## Monorepo structure

| Package | Description |
|---|---|
| [`packages/backend`](packages/backend) | **`marci-admin`** — the publishable npm package |
| [`packages/frontend`](packages/frontend) | Vue 3 SPA bundled into the backend package at build time |
| [`packages/marci-orm`](packages/marci-orm) | Lightweight type-safe ORM (not published to npm, local workspace only) |
| [`packages/dev-app`](packages/dev-app) | Example application — shows how to wire everything together |
| [`packages/plugins`](packages/plugins) | Bun build plugins for Vue SFC and SVG sprites |

---

## Installation

```bash
bun add marci-admin
```

**Peer dependencies:**

```bash
bun add @den59k/marci compact-json-schema
```

---

## Quick start

```typescript
import { createApp } from "@den59k/marci";
import { createAdminPanel } from "marci-admin";

const app = createApp({ port: 3000 });
const adminPanel = createAdminPanel();

// Register auth
adminPanel.registerAuthMethod({
  fields: { login: { type: "string" }, password: { type: "string" } },
  onLogin: async ({ login, password }) => {
    if (login !== "admin" || password !== "secret") return null;
    return { id: 1, name: "Admin" };
  },
  onRequest: async (token) => {
    // verify JWT / session and return user, or null to reject
    return verifyToken(token);
  },
});

// Define a CRUD page
adminPanel
  .createPage({ title: "Users", path: "users" })
  .data(async ({ take, skip }) => db.users.findMany({ take, skip }))
  .primaryKey("id", "number")
  .item(async (id) => db.users.findFirst({ where: { id } }))
  .table([
    { title: "ID", field: "id", width: 50 },
    { title: "Name", field: "name" },
    { title: "Label", template: "{id} - {name}" },
  ])
  .createForm(userSchema, async (data) => db.users.create(data))
  .updateForm(userSchema, async (id, data) => db.users.update({ where: { id }, data }))
  .onDelete(async (ids) => db.users.deleteMany({ where: { id: { in: ids } } }));

app.register(adminPanel);
app.listen();
```

The admin panel is available at `http://localhost:3000/admin`.

---

## Page builder API

| Method | Description |
|---|---|
| `.data(fn)` | Fetch the list — receives `{ take, skip }`, returns an array of rows |
| `.primaryKey(field, type)` | Declare the identity field (`"number"` or `"string"`) |
| `.item(fn)` | Fetch a single record by id |
| `.table(columns)` | Column definitions for the table view — see [Column types](#column-types) below |
| `.createForm(schema, fn)` | Form schema + async handler for record creation |
| `.updateForm(schema, fn)` | Form schema + async handler for record update |
| `.onDelete(fn)` | Async handler for bulk delete — receives an array of ids |
| `.component(path)` | Absolute path to a `.vue` file rendered as the page body; compiled on-demand and served to the frontend |
| `.componentData(name, fn)` | Register a named GET endpoint the custom component can fetch; `fn` receives query params |
| `.componentData(name, schema, fn)` | Same as above with a [`compact-json-schema`](https://github.com/den59k/compact-json-schema) for query param validation |

Form schemas use [`compact-json-schema`](https://github.com/den59k/compact-json-schema) format.

### Column types

Pass an array of column descriptors to `.table()`. Each column must have a `title` and optionally a `width` (pixels or `"Nfr"` fraction).

| Column kind | Required fields | Description |
|---|---|---|
| Field | `field` | Renders the value of `field` from the row object |
| Template | `template` | String with `{field}` placeholders, e.g. `"{id} - {name}"` (powered by [`itomori`](https://github.com/den59k/itomori)) |
| Action | `onClick` | Button column (icon or text label); only available after `.primaryKey()` |

---

## marci-orm

`marci-orm` is a lightweight, type-safe query builder included in this repository as a local workspace package. It is **not published to npm** — import it through the monorepo workspace (`"marci-orm": "*"` in your workspace `package.json`).

```typescript
import { table, createData } from "marci-orm";

const users = table("users", {
  id: { type: "integer", primaryKey: true, default: "inc" },
  name: { type: "text" },
  email: { type: "text", unique: true },
});

const db = createData({ users });

const list = await db.users.findMany({ take: 20, skip: 0 });
const user = await db.users.findFirst({ where: { id: 1 } });
```

---

## Development

**Requirements:** [Bun](https://bun.sh) v1.2+

```bash
# Install dependencies
bun install

# Start the dev app (auto-restart on changes)
bun --watch packages/dev-app/src/main.ts

# Build the frontend and copy it into the backend package
bun run packages/frontend/build.ts

# Build the backend package for publishing
cd packages/backend && bun run build
```

The dev app runs at `http://localhost:3000`. The admin panel is at `/admin`.

---

## License

MIT © [den59k](https://github.com/den59k)
