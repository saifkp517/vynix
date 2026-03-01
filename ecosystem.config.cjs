module.exports = {
  apps: [
    {
      name: "rest-api",
      script: "bun",
      args: "run ./vynix/rest-api/index.ts",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "socket-server",
      script: "bun",
      args: "run ./vynix/socket-server/index.ts",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
