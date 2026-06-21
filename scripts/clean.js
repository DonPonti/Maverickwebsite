const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "..", "_site", "posts");
fs.rmSync(target, { recursive: true, force: true });
