import { MarciApp, HTTPError } from "@den59k/marci";
import { join } from 'node:path'
import { Glob, type BunRequest } from "bun";
import { createAdminPanel } from 'marci-admin'
// import { createAdminPanel } from "../../backend/src/main";
import { db } from "./plugins/db";
import { generateToken, verifyToken } from "./utils/generateSecretToken";

const app = new MarciApp();

const getPrefix = (path: string, base = "/api/") => {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  if (lastSlash > 0) {
    return base + path.slice(0, lastSlash)
  } else {
    return base
  }
}

app.register(async () => {
  await db.connect()
})

const routes = new Glob("**/*.ts");
for await (const routeFile of routes.scan({ cwd: join(__dirname, "routes") })) {
  const module = await import(join(__dirname, "routes", routeFile))
  if (!module.default) {
    continue
  }

  const prefix = module.prefix ?? getPrefix(routeFile)
  app.register(module.default, { prefix })
}
app.get("/api", () => ({ status: "up" }))

const adminPanel = createAdminPanel()
const adminPages = new Glob("**/*.ts");
for await (const routeFile of adminPages.scan({ cwd: join(__dirname, "routes-admin") })) {
  const module = await import(join(__dirname, "routes-admin", routeFile))
  if (!module.default) {
    continue
  }
  adminPanel.register(module.default, routeFile.slice(0, routeFile.indexOf(".")))
}

const accounts: Record<string, string> = {
  root: "123123"
}
adminPanel.registerAuthMethod({
  fields: {
    login:{ type: "string", label: "Логин" }, 
    password: { type: "string", label: "Пароль", hidden: true } 
  },
  async onLogin(data) {
    if (!accounts[data.login] || accounts[data.login] !== data.password) {
      throw new HTTPError("Wrong login or password", 403)
    }
    return generateToken({ login: data.login })
  },
  async onRequest(token) {
    const data = verifyToken(token)
    if (!data) {
      throw new HTTPError("Wrong token")
    }
  }
})

app.register(adminPanel)

// @ts-ignore
app.routes["/uploads/*"] = {
  "GET": (ctx: BunRequest) => {
    const path = ctx.url.slice(ctx.url.indexOf("/uploads/")+9)
    const file = Bun.file(join(process.cwd(), "uploads", path))
    return new Response(file)
  }
}

app.listen(3000, process.env.HOST).then((server) => {
  console.info(`Server launched on ${server.url}`)
})