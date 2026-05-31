import { type MarciApp, HTTPError } from "@den59k/marci";
// import type { ViteDevServer } from "vite";
// import frontendIndex from '../../frontend/index.html'
import { join, normalize } from "node:path"
import { schema, unfoldSchema, type SchemaItem, type SchemaType } from "compact-json-schema";

type AdminPanelPlugin<T extends any[]> = (app: AdminPanel, ...options: T) => void | Promise<void>

type AuthMethod<T extends SchemaItem, K> = {
  title?: string,
  fields: T, 
  onLogin: (data: SchemaType<T>) => K | Promise<K>,
  onRequest: (token: K) => void | Promise<void>
}

export type AdminPanel = {
  createPage<T extends object, K extends keyof T>(options: CreatePageOptions): Page<T>,
  register<T extends any[]>(func: AdminPanelPlugin<T>, ...options: T): void
  registerAuthMethod<T extends SchemaItem, K>(method: AuthMethod<T, K>): void
}

export type AdminPanelMarci = ((app: MarciApp<any>) => Promise<void>) & AdminPanel

type PageEntry = {
  title?: string,
  path?: string,
  table?: any
  data?: (options: any) => Promise<any>,
  itemData?: (id: any) => Promise<any>,
  onInsert?: (obj: any) => Promise<void>,
  onUpdate?: (key: any, obj: any) => Promise<void>,
  onDelete?: (key: any[]) => Promise<void>
  createForm?: any,
  updateForm?: any,
  primaryKey?: string | number | symbol,
  primaryKeyType?: SchemaItem,
  dataMapper: { map: (item: any) => any, key: string }[]
}

declare const __PRODUCTION__: boolean

export const createAdminPanel = (): AdminPanelMarci => {

  const plugins: [AdminPanelPlugin<any>, any][] = []

  const pages: PageEntry[] = []
  let authMethod: AuthMethod<any, any> | null = null

  const plugin = async (app: MarciApp) => {
    for (let childPlugin of plugins as any) {
      await childPlugin[0](plugin, ...childPlugin[1])
    }

    if (authMethod) {
      app.addHook("onRequest", async (req) => {
        if (req.raw.url.endsWith("/auth")) {
          return
        }
        let token = req.raw.headers.get("Authorization")
        if (!token) throw new HTTPError("Authorization required", 403)
        if (token.startsWith("Bearer ")) token = token.slice(7)
        await authMethod!.onRequest(token)
      })

      app.get("/api/admin/auth", () => {
        return { title: authMethod!.title, fields: authMethod!.fields }
      })
      const loginSchema = authMethod.fields
      app.post("/api/admin/auth", { body: loginSchema }, async (req) => {
        // @ts-ignore
        return await authMethod!.onLogin(req.body)
      })
    }

    app.get("/api/admin/pages", async (req) => {
      return pages.map(p => ({
        path: p.path,
        title: p.title
      }))
    })

    for (let page of pages) {
      const querySchema = schema({ take: "number?", skip: "number?" })

      if (!page.data) {

      } else if (page.dataMapper.length === 0) {
        app.get(`/api/admin/data/${page.path}/items`, [{}, querySchema], (req) => {
          const items = page.data!(req.query)
          return items
        })
      } else {
        app.get(`/api/admin/data/${page.path}/items`, [{}, querySchema], async (req) => {
          const items = await page.data!(req.query)
          for (let item of items) {
            Object.assign(item, Object.fromEntries(page.dataMapper.map(i => [ i.key, i.map(item) ])))
          }
          return items
        })
      }

      const paramsSchema = schema({ itemId: page.primaryKeyType ?? 'string' })
      if (page.itemData) {
        app.get(`/api/admin/data/${page.path}/items/:itemId`, [ paramsSchema ], async (req) => {
          return await page.itemData!(req.params.itemId)
        })
      }

      if (page.createForm && page.onInsert) {
        app.post(`/api/admin/data/${page.path}/items`, [{}, page.createForm.schema], async (req) => {
          // @ts-ignore
          await page.onInsert!(req.body)
        })
      }

      if (page.updateForm && page.onUpdate) {
        app.post(`/api/admin/data/${page.path}/items/:itemId`, [paramsSchema, page.updateForm.schema], async (req) => {
          // @ts-ignore
          await page.onUpdate!(req.params.itemId, req.body)
        })
      }

      if (page.onDelete) {
        const deleteSchema = schema({ itemIds: { type: "array", items: page.primaryKeyType ?? 'string' } })

        app.delete(`/api/admin/data/${page.path}/items`, [{}, deleteSchema], async (req) => {
          // @ts-ignore
          await page.onDelete!(req.body.itemIds)
        })
      }

      app.get(`/api/admin/pages/${page.path}`, async (req) => {
        return {
          title: page.title,
          path: page.path,
          table: page.table,
          primaryKey: page.primaryKey,
          createForm: page.createForm,
          updateForm: page.updateForm,
          itemAccess: !!page.itemData,
          allowDelete: page.onDelete ? true: undefined
        }
      })
    }
    
    const routesRaw = (app as any).routes

    if (typeof __PRODUCTION__ !== "undefined" && __PRODUCTION__) {
      const frontendDir = join(import.meta.dir, "frontend")
  
      // index.html читаем один раз и держим в памяти
      const indexHtml = await Bun.file(join(frontendDir, "index.html")).text()
      const serveIndex = () =>
        new Response(indexHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } })
  
      const ASSETS_PREFIX = "/admin/assets/"
      routesRaw[ASSETS_PREFIX + "*"] = (req: Request) => {
        const { pathname } = new URL(req.url)
        const rel = normalize(pathname.slice(ASSETS_PREFIX.length))
        if (rel.startsWith("..")) return new Response("Not found", { status: 404 }) // защита от path traversal
        return new Response(Bun.file(join(frontendDir, rel))) // Content-Type Bun проставит по расширению
      }
  
      // SPA-fallback
      routesRaw["/admin"] = serveIndex
      routesRaw["/admin/*"] = serveIndex
    } else {
      routesRaw["/admin/*"] = frontendIndex
      routesRaw["/admin"] = frontendIndex
    }

  }
  
  plugin.createPage = <T extends object>(options: CreatePageOptions) => {

    const currentPage: PageEntry = { path: options.path, title: options.title, dataMapper: [] }
    pages.push(currentPage)

    const data: PageWithPrimaryKey<T, "string", T> = {
      table(table) { 
        currentPage.table = table
        for (let column in table) {
          if (!table[column]) continue
          if (table[column] === true) {
            table[column] = { title: column }
            continue
          }
          if (typeof table[column] === "object" && table[column].map) {
            const key = "@"+column
            currentPage.dataMapper.push({ key, map: table[column].map })
            Object.assign(table[column], { map: undefined, key, sortable: false })
          }
        }
        return this
      },
      primaryKey(key, type?: SchemaItem){ 
        currentPage.primaryKey = key
        currentPage.primaryKeyType = type ?? "string"
        return this as any
      },
      data(query) {
        currentPage.data = query 
        return this as any
      },
      item(query) {
        currentPage.itemData = query
        return this as any
      },
      createForm(schema, onInsert) {
        currentPage.createForm = { schema: unfoldSchema(schema) }
        currentPage.onInsert = onInsert
        return this
      },
      updateForm(schema, onUpdate) {
        currentPage.updateForm = { schema: unfoldSchema(schema) }
        currentPage.onUpdate = onUpdate
        return this
      },
      onDelete(onDelete) {
        currentPage.onDelete = onDelete
        return this
      }
    }
    return data
  }

  plugin.register = <T extends any[]>(func: AdminPanelPlugin<T>, ...options: T) => {
    plugins.push([func, options])
  }

  plugin.registerAuthMethod = <T extends SchemaItem>(method: AuthMethod<T, any>) => { 
    method.fields = unfoldSchema(method.fields)
    authMethod = method
  }
  
  return plugin as any
}

type CreatePageOptions = {
  title?: string
  path?: string
}

type ColumnType<T> = {
  title?: string, map?: (item: T) => any,
  width?: number | string
}

type TableSchema<T, S extends string | number | symbol> = Record<S, true | ColumnType<T>>

interface Page<T extends object> {
  table<S extends keyof T | `_${string}`>(table: TableSchema<T, S>): this,
  createForm<S extends SchemaItem>(schema: S, onInsert: (data: SchemaType<S>) => Promise<void>): this,
  primaryKey<KeyType extends SchemaItem = "string">(key: keyof T, type?: KeyType): PageWithPrimaryKey<T, KeyType, T>,
  data<T2 extends object>(query: (options: { skip: number, take: number }) => Promise<T2[]>): Page<T2>,
}

interface PageWithPrimaryKey<T extends object, KeyType extends SchemaItem, Item extends object> extends Page<T> {
  item<T2 extends object>(query: (itemId: SchemaType<KeyType>) => Promise<T2 | null>): PageWithPrimaryKey<T, KeyType, T2>,
  updateForm<S extends SchemaItem>(schema: S, onUpdate: (id: SchemaType<KeyType>, data: SchemaType<S>) => Promise<void>): PageWithPrimaryKey<T, KeyType, Item>,
  onDelete(onDelete: (ids: SchemaType<KeyType>[]) => Promise<void>): PageWithPrimaryKey<T, KeyType, Item>
}