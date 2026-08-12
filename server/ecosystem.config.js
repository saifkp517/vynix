module.exports = {
  apps: [{
    name: 'server',
    script: 'pnpm',
    args: 'run start',
    interpreter: 'none',
    env: {
      PORT: 4001
    }
  }]
}
