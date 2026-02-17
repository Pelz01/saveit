module.exports = {
  apps: [
    {
      name: "grabh",
      script: "src/index.ts",
      interpreter: "bun",
      env: {
        NODE_ENV: "production",
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      time: true,
    },
  ],
};
