import esbuild from 'esbuild';
import { copyFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: false,
  treeShaking: true,
  outfile: 'main.js',
  logLevel: 'info',
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(options);
  copyFileSync('src/styles.css', 'styles.css');
}
