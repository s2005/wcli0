import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rawArgs = process.argv.slice(2);
const debug = rawArgs.includes("--debug");
const argsWithoutDebug = rawArgs.filter((arg) => arg !== "--debug");

let command = "ls";
let configPath;
let forceAllowAllDirs = false;
const positionalArgs = [];
for (let i = 0; i < argsWithoutDebug.length; i += 1) {
  const arg = argsWithoutDebug[i];
  if (arg === "--comand" || arg === "--command" || arg === "-c") {
    const value = argsWithoutDebug[i + 1];
    if (!value) {
      throw new Error("Missing value for --comand/--command/-c");
    }
    command = value;
    i += 1;
    continue;
  }
  if (arg === "--config" || arg === "-f") {
    const value = argsWithoutDebug[i + 1];
    if (!value) {
      throw new Error("Missing value for --config/-f");
    }
    configPath = path.resolve(value);
    i += 1;
    continue;
  }
  if (arg === "--allowAllDirs") {
    forceAllowAllDirs = true;
    continue;
  }
  positionalArgs.push(arg);
}

const serverPath = path.resolve(__dirname, "../../../dist/index.js");
const targetDir = positionalArgs[0] ? path.resolve(positionalArgs[0]) : process.cwd();
const shell = positionalArgs[1] ?? "bash";

if (configPath && !fs.existsSync(configPath)) {
  throw new Error(`Config file not found: ${configPath}`);
}

const serverArgs = [serverPath, "--shell", shell];
if (!configPath || forceAllowAllDirs) {
  serverArgs.push("--allowAllDirs");
}
if (configPath) {
  serverArgs.push("--config", configPath);
}
const callToolPayload = {
  name: "execute_command",
  arguments: {
    shell,
    command,
    workingDir: targetDir
  }
};

const transport = new StdioClientTransport({
  command: process.execPath,
  args: serverArgs,
  stderr: "inherit"
});

const client = new Client(
  { name: "wcli0-test-client", version: "1.0.0" },
  { capabilities: {} }
);

function formatErrorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error);
  const cleaned = raw.replace(/(MCP error -?\d+:\s*)+/gi, "").trim();
  return cleaned || raw;
}

function printHumanReadableError(error) {
  const message = formatErrorMessage(error);
  const code = error && typeof error === "object" ? error.code : undefined;
  const codeSuffix = code !== undefined ? ` (code: ${code})` : "";
  console.error(`Error: ${message}${codeSuffix}`);
}

async function main() {
  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    console.log("Tools:", toolNames.join(", "));
    if (debug) {
      console.log("\nDEBUG: server start args:\n");
      console.log(JSON.stringify(serverArgs, null, 2));
      console.log("\nDEBUG: listTools() full response:\n");
      console.log(JSON.stringify(tools, null, 2));
    }

    if (!toolNames.includes("execute_command")) {
      throw new Error(
        "The MCP server did not expose execute_command. " +
          "Try a different shell argument, e.g. `bash`."
      );
    }

    if (debug) {
      console.log("\nDEBUG: callTool() request payload:\n");
      console.log(JSON.stringify(callToolPayload, null, 2));
    }

    const result = await client.callTool(callToolPayload);

    if (debug) {
      console.log("\nDEBUG: callTool() raw response:\n");
      console.log(JSON.stringify(result, null, 2));
    }

    const text = (result.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    console.log(`\n${command} output:\n`);
    console.log(text || "(no text output)");

    if (result.isError) {
      process.exitCode = 1;
    }
  } catch (error) {
    printHumanReadableError(error);
    process.exitCode = 1;
    if (debug && error instanceof Error) {
      console.error("\nDEBUG: stack trace:\n");
      console.error(error.stack ?? error.message);
    }
  } finally {
    try {
      await client.close();
    } catch (closeError) {
      if (debug) {
        console.error("\nDEBUG: failed to close MCP client cleanly:\n");
        console.error(closeError instanceof Error ? closeError.stack ?? closeError.message : String(closeError));
      }
    }
  }
}

await main();
