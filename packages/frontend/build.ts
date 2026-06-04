import vuePlugin from "../plugins/vue-plugin.ts"
import svgPlugin from "../plugins/svg-plugin.ts"
import { rm, cp } from "node:fs/promises"
import { rollup } from "rollup"
import { dts } from "rollup-plugin-dts"
import { Glob } from "bun"

const OUT = "./dist"
const PUBLIC_PATH = "/admin/assets/" // префикс раздачи ./dist; обязан заканчиваться на "/"

// Общий define для всех сборок.
const define = {
  "process.env.NODE_ENV": JSON.stringify("production"),
}

// Vue feature-флаги. Нужны в КАЖДОМ бандле, который содержит код vue
// или vue-router — оба ссылаются на эти идентификаторы, и define
// подставляет значения только внутрь собираемого бандла.
const vueFlags = {
  __VUE_OPTIONS_API__: "true",
  __VUE_PROD_DEVTOOLS__: "false",
  __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
}

const plugins = [vuePlugin, svgPlugin]

// Обёртка над Bun.build: общий конфиг + единая обработка ошибок.
async function build(label: string, config: Parameters<typeof Bun.build>[0]) {
  const result = await Bun.build({
    minify: true,
    target: "browser",
    format: "esm",
    define,
    ...config,
  })
  if (!result.success) {
    console.error(`${label} build failed:`)
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
  return result
}

// ЕДИНСТВЕННЫЙ источник правды по общим зависимостям.
// Каждая собирается в vendor/<name>.js (фикс. имя, без хеша) и резолвится
// в браузере через import map по ключу specifier.
// external: ["vue"] почти у всех — все обязаны делить ОДИН инстанс Vue.
const VENDORS = [
  {
    specifier: "vue",
    name: "vue",
    entry: "./src/vendor/vue.ts",
    external: [], // сам Vue ничего не выносит
    plugins: undefined,
  },
  {
    specifier: "vue-router",
    name: "vue-router",
    entry: "./src/vendor/vue-router.ts",
    external: ["vue"],
    plugins: undefined,
  },
  {
    specifier: "marci-admin/ui",
    name: "sdk",
    entry: "./src/vendor/sdk.ts",
    external: ["vue", "vue-router"],
    plugins, // SDK содержит UI-компоненты — плагины нужны
  },
] satisfies Array<{
  specifier: string
  name: string
  entry: string
  external: string[]
  plugins?: typeof plugins
}>

// Чистим прошлую сборку.
await rm(OUT, { recursive: true, force: true })

// 1) Вендорные бандлы.
for (const v of VENDORS) {
  await build(v.specifier, {
    entrypoints: [v.entry],
    outdir: `${OUT}/vendor`,
    naming: {
      entry: "[name].js",
      chunk: "[name]-[hash].js",
      asset: "[name]-[hash].[ext]",
    },
    external: v.external,
    define: { ...define, ...vueFlags },
    plugins: v.plugins,
  })
}

// 2) Ядро из index.html.
//    external выводим из VENDORS — всё, что есть в import map, не должно
//    инлайниться в ядро, иначе получим дубли инстансов.
await build("core", {
  entrypoints: ["./index.html"],
  outdir: OUT,
  publicPath: PUBLIC_PATH,
  external: VENDORS.map((v) => v.specifier),
  plugins,
})

// 3) Дописываем import map в собранный HTML (Bun сам этого не делает).
//    Должен стоять ПЕРЕД первым module-скриптом.
const imports = Object.fromEntries(
  VENDORS.map((v) => [v.specifier, `${PUBLIC_PATH}vendor/${v.name}.js`]),
)
const importMap = `\n<script type="importmap">${JSON.stringify({ imports })}</script>`

const htmlPath = `${OUT}/index.html`
const html = (await Bun.file(htmlPath).text()).replace(
  /<script\b/i,
  `${importMap}\n<script`,
)
await Bun.write(htmlPath, html)

// 4) Копируем результат в бэкенд.
await cp(OUT, "../backend/dist/frontend", { recursive: true })
await cp(OUT, "../backend/src/frontend", { recursive: true })

console.info("Build complete →", OUT, "→ ../backend/{dist,src}/frontend")


// 1. vue-tsc эмитит дерево .d.ts
const tsc = Bun.spawn(
  ["bunx", "vue-tsc", "-p", "tsconfig.sdk.json", "--emitDeclarationOnly"],
  { stdout: "inherit", stderr: "inherit" }
)
if (await tsc.exited !== 0) { console.error("vue-tsc failed"); process.exit(1) }

// 2. находим точку входа независимо от того, как vue-tsc разложил дерево
let input = ""
for await (const f of new Glob("**/sdk.d.ts").scan("./.dts-tmp")) { input = `./.dts-tmp/${f}`; break }
if (!input) throw new Error("sdk.d.ts not found in .dts-tmp")

// 3. сворачиваем граф типов в один файл
const bundle = await rollup({
  input,
  plugins: [dts()],
  external: [/^vue/, "vuesix", "@vueuse/core"],   // см. ниже
})
await bundle.write({ file: "../backend/dist/types/ui.d.ts", format: "es" })
await bundle.close()

// 4. убираем за собой
await rm("./.dts-tmp", { recursive: true, force: true })

console.info("Build types complete →", input, "→ ../backend/dist/types/ui.d.ts")
