const esbuild = require('esbuild');

async function main() {
  await esbuild.build({
    entryPoints: {
      runTest: 'test/integration/runTest.ts',
      suite: 'test/integration/suite.ts',
    },
    outdir: 'dist-test',
    bundle: true,
    external: ['vscode', 'mocha', '@vscode/test-electron'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    logLevel: 'info',
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
