import * as esbuild from '/ui/node_modules/esbuild/lib/main.js'
import fs from 'fs'
const entry = process.argv[2]
const alias = {
  name: 'alias',
  setup(b) {
    b.onResolve({ filter: /^@\// }, async a => { const r = await b.resolve('./' + a.path.slice(2), { kind: a.kind, resolveDir: '/web/src' }); return r.errors.length ? { errors: r.errors } : { path: r.path } })
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: '/ui/stubs/next-navigation.ts' }))
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: '/ui/stubs/next-link.tsx' }))
  },
}
await esbuild.build({
  entryPoints: [`/ui/entries/${entry}.tsx`], bundle: true, outfile: `/ui/dist/${entry}.js`,
  format: 'iife', platform: 'browser', target: 'es2020', jsx: 'automatic', sourcemap: false,
  nodePaths: ['/ui/node_modules'], plugins: [alias], loader: { '.css': 'css', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.eot': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
})
fs.writeFileSync(`/ui/dist/${entry}.html`, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="tailwind.css"><link rel="stylesheet" href="${entry}.css"></head><body style="margin:0"><div id="root"></div><script src="data/${entry}.js"></script><script src="${entry}.js"></script></body></html>`)
console.log('built', entry)
