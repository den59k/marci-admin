import vuePlugin from "../plugins/vue-plugin.ts" // Ваш плагин
import svgPlugin from "../plugins/svg-plugin.ts" // Ваш плагин
import { rm, cp } from "node:fs/promises"

const OUT = "./dist"
// Под этим префиксом бэкенд админки будет раздавать содержимое ./dist.
// Должен заканчиваться на "/".
const PUBLIC_PATH = "/admin/assets/"

// Чистим прошлую сборку
await rm(OUT, { recursive: true, force: true })

const define = {
  "process.env.NODE_ENV": JSON.stringify("production"),
}

// 1) Собираем общий вендорный Vue — это ЕДИНСТВЕННЫЙ инстанс,
//    который потом импортируют и ядро, и все плагины.
//    Vue-бандлерные сборки требуют, чтобы эти флаги были определены,
//    иначе будут варнинги/мусор в проде.
await Bun.build({
  entrypoints: ["./src/vendor/vue.ts"], // файл с одной строкой: export * from "vue"
  outdir: `${OUT}/vendor`,
  naming: { entry: "[name].js" }, // фиксированное имя vue.js, без хеша — на него ссылается import map
  minify: true,
  target: "browser",
  format: "esm",
  define: {
    ...define,
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
})

// 2) Собираем само ядро из index.html.
//    external: ["vue"] — ключевой момент: bare-импорты `import { ref } from "vue"`
//    НЕ инлайнятся в бандл, а остаются как есть и резолвятся через import map в браузере.
//    publicPath проставляет правильный префикс ко всем ассетам в выходном HTML.
const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: OUT,
  minify: true,
  target: "browser",
  publicPath: PUBLIC_PATH,
  external: ["vue"],
  define,
  plugins: [vuePlugin, svgPlugin], // ваши плагины
})

if (!result.success) {
  console.error("Build failed:")
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

// 3) Bun не умеет сам вставлять import map, поэтому дописываем его в собранный HTML.
//    Он обязан стоять ПЕРЕД первым module-скриптом, иначе bare-импорты не зарезолвятся.
const importMap = `\n<script type="importmap">${JSON.stringify({
  imports: {
    vue: `${PUBLIC_PATH}vendor/vue.js`,
    // когда появится UI-SDK для плагинов, добавишь сюда же:
    // "marci-admin/ui": `${PUBLIC_PATH}vendor/sdk.js`,
  },
})}</script>`

const htmlPath = `${OUT}/index.html`
let html = await Bun.file(htmlPath).text()
// Вставляем перед первым <script ...> в документе
html = html.replace(/<script\b/i, `${importMap}\n<script`)
await Bun.write(htmlPath, html)

await cp("dist", "../backend/dist/frontend", { recursive: true })

console.info("Build complete →", OUT, "→", "../backend/dist/frontend")