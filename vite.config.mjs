const isExport = process.argv.includes('export')

const liveFlags = {
  __DEV__: 'true',
  __SLIDEV_HASH_ROUTE__: 'false',
  __SLIDEV_MEMORY_ROUTE__: 'false',
  __SLIDEV_FEATURE_DRAWINGS__: 'true',
  __SLIDEV_FEATURE_DRAWINGS_PERSIST__: 'false',
  __SLIDEV_FEATURE_EDITOR__: 'false',
  __SLIDEV_FEATURE_RECORD__: 'true',
  __SLIDEV_FEATURE_PRESENTER__: 'true',
  __SLIDEV_FEATURE_PRINT__: isExport ? 'true' : 'false',
  __SLIDEV_FEATURE_BROWSER_EXPORTER__: 'false',
  __SLIDEV_FEATURE_WAKE_LOCK__: 'true',
  __SLIDEV_FEATURE_PWA__: 'false',
  __SLIDEV_HAS_SERVER__: 'true',
}

function liveFlagsPlugin() {
  return {
    name: 'slidev-control-room:live-flags',
    apply: 'serve',
    enforce: 'pre',
    transformIndexHtml(html) {
      if (isExport || html.includes('/slide-live-bridge.js'))
        return html
      return html.replace('</body>', '<script type="module" src="/slide-live-bridge.js?mode=live"></script></body>')
    },
    transform(code, id) {
      if (!id.includes('/@slidev/client/'))
        return
      let transformed = code
      for (const [flag, value] of Object.entries(liveFlags))
        transformed = transformed.replaceAll(flag, value)
      if (transformed !== code)
        return { code: transformed, map: null }
    },
  }
}

// Slidev 52.20 + Vite 8 currently misses Slidev's compile-time constants in
// dev mode. The plugin covers TypeScript modules as well as Vue components.
// Build mode keeps Slidev's own flags, including presenter: dev.
export default ({ command }) => ({
  build: {
    cssMinify: false,
  },
  ...command === 'serve'
    ? {
        define: liveFlags,
        plugins: [liveFlagsPlugin()],
      }
    : {},
})
