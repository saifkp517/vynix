module.exports = {
  apps: [{
    name: 'server-nest',
    script: 'pnpm',
    args: 'run start',
    interpreter: 'none',
    env: {
      PORT: 5000
    }
  }]
}
