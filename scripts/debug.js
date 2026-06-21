process.env.DEBUG = "*";
const { execSync } = require("child_process");

execSync("npx eleventy", { stdio: "inherit", env: process.env });
execSync("npm run test", { stdio: "inherit", env: process.env });
