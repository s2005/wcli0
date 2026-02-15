import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templatePath = path.resolve(__dirname, "wcli0-local-only.config.template.json");
const outputPath = path.resolve(__dirname, "wcli0-local-only.config.json");

const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));

// Server path normalization currently lowercases allowed paths in this build.
const localDir = __dirname.toLowerCase();

template.global.paths.allowedPaths = [localDir];
template.global.paths.initialDir = localDir;

fs.writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
console.log(`Generated ${path.basename(outputPath)} with allowed path: ${localDir}`);
