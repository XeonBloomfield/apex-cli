import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { cli: 'src/cli.js' },
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  hash: false,
  minify: false,
  dts: false,
  shims: true,
  deps: {
    onlyBundle: [/^@clack\//, 'jsonc-parser', 'smol-toml', /^fast-/, 'sisteransi'],
  },
  // jsonc-parser ships an UMD `main` whose relative requires survive bundling, so pick its ESM build.
  alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' },
  outExtensions: () => ({ js: '.js' }),
});
