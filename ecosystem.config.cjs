module.exports = {
  apps: [
    {
      name: 'slidev-control-room',
      script: 'server/index.mjs',
      cwd: __dirname,
      node_args: `--env-file-if-exists=${__dirname}/.env`,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
