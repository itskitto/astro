const { readFile } = require('fs').promises;
// Snowpack plugins must be CommonJS :(
const transformPromise = import('./dist/compiler/index.js');

const DEFAULT_HMR_PORT = 12321;

/** @type {import('snowpack').SnowpackPluginFactory<any>} */
module.exports = (snowpackConfig, { resolvePackageUrl, renderers, astroConfig } = {}) => {
  let hmrPort = DEFAULT_HMR_PORT;
  return {
    name: 'snowpack-astro',
    knownEntrypoints: ['astro/dist/internal/h.js', 'astro/components/Prism.astro'],
    resolve: {
      input: ['.astro', '.md'],
      output: ['.js', '.css'],
    },
    /** 
      * This injects our renderer plugins to the Astro runtime (as a bit of a hack).
      *
      * In a world where Snowpack supports virtual files, this won't be necessary and
      * should be refactored to a virtual file that is imported by the runtime.
      *
      * Take a look at `/src/frontend/__astro_component.ts`. It relies on both
      * `__rendererSources` and `__renderers` being defined, so we're creating those here.
      *
      * The output of this is the following (or something very close to it):
      *
      * ```js
      * import * as __renderer_0 from '/_snowpack/link/packages/renderers/vue/index.js';
      * import * as __renderer_1 from '/_snowpack/link/packages/renderers/svelte/index.js';
      * import * as __renderer_2 from '/_snowpack/link/packages/renderers/preact/index.js';
      * import * as __renderer_3 from '/_snowpack/link/packages/renderers/react/index.js';
      * let __rendererSources = ["/_snowpack/link/packages/renderers/vue/client.js", "/_snowpack/link/packages/renderers/svelte/client.js", "/_snowpack/link/packages/renderers/preact/client.js", "/_snowpack/link/packages/renderers/react/client.js"];
      * let __renderers = [__renderer_0, __renderer_1, __renderer_2, __renderer_3];
      * // the original file contents
      * ```
      */
    async transform({contents, id, fileExt}) {
      if (fileExt === '.js' && /__astro_component\.js/g.test(id)) {
        const rendererServerPackages = renderers.map(({ server }) => server);
        const rendererClientPackages = await Promise.all(renderers.map(({ client }) => resolvePackageUrl(client)));
        const result = `${rendererServerPackages.map((pkg, i) => `import __renderer_${i} from "${pkg}";`).join('\n')}
let __rendererSources = [${rendererClientPackages.map(pkg => `"${pkg}"`).join(', ')}];
let __renderers = [${rendererServerPackages.map((_, i) => `__renderer_${i}`).join(', ')}];
${contents}`;
        return result;
      }
    },
    config(snowpackConfig) {
      if(!isNaN(snowpackConfig.devOptions.hmrPort)) {
        hmrPort = snowpackConfig.devOptions.hmrPort;
      }
    },
    async load({ filePath }) {
      const { compileComponent } = await transformPromise;
      const projectRoot = snowpackConfig.root;
      const contents = await readFile(filePath, 'utf-8');
      const compileOptions = {
        astroConfig,
        hmrPort,
        resolvePackageUrl,
        renderers,
      };
      const result = await compileComponent(contents, { compileOptions, filename: filePath, projectRoot });
      const output = {
        '.js': { code: result.contents },
      };
      if (result.css) output['.css'] = result.css;
      return output;
    },
  };
};
