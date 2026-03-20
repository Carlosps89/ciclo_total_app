module.exports = {
  apps: [
    {
      name: 'pac-dashboard',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        AWS_PROFILE: 'rumo-sso'
      },
      exp_backoff_restart_delay: 100,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'pac-bot-agent',
      script: 'npx',
      args: 'tsx src/workers/tg-agent-worker.ts',
      env: {
        NODE_ENV: 'production',
        AWS_PROFILE: 'rumo-sso'
      },
      exp_backoff_restart_delay: 5000,
      watch: false,
      max_memory_restart: '512M'
    }
  ]
};
