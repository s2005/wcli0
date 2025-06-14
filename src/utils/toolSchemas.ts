import type { ServerConfig, ResolvedShellConfig } from '../types/config.js';

export interface ToolSchema {
  type: string;
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Build dynamic input schema for execute_command based on enabled shells
 */
export function buildExecuteCommandSchema(
  enabledShells: string[],
  resolvedConfigs: Map<string, ResolvedShellConfig>
): ToolSchema {
  if (enabledShells.length === 0) {
    throw new Error('No shells enabled');
  }
  
  // Build shell descriptions with key settings
  const shellDescriptions: Record<string, string> = {};
  for (const shell of enabledShells) {
    const config = resolvedConfigs.get(shell);
    if (config) {
      const parts = [`${shell} shell`];
      parts.push(`timeout: ${config.security.commandTimeout}s`);
      
      if (shell === 'wsl') {
        parts.push('Unix paths');
      } else if (shell === 'cmd' || shell === 'powershell') {
        parts.push('Windows paths');
      } else if (shell === 'gitbash') {
        parts.push('Mixed paths');
      }
      
      shellDescriptions[shell] = parts.join(' - ');
    }
  }
  
  return {
    type: "object",
    properties: {
      shell: {
        type: "string",
        enum: enabledShells,
        description: "Shell to use for command execution",
        enumDescriptions: shellDescriptions
      },
      command: {
        type: "string",
        description: "Command to execute. Note: Different shells have different blocked commands and operators."
      },
      workingDir: {
        type: "string",
        description: "Working directory (optional). Format depends on shell type:\n" +
                   "- Windows shells (cmd, powershell): Use C:\\Path\\Format\n" +
                   "- WSL: Use /unix/path/format\n" +
                   "- Git Bash: Both formats accepted"
      }
    },
    required: ["shell", "command"],
    additionalProperties: false
  };
}

/**
 * Build schema for validate_directories with optional shell parameter
 */
export function buildValidateDirectoriesSchema(
  enabledShells: string[]
): ToolSchema {
  const schema: ToolSchema = {
    type: "object",
    properties: {
      directories: {
        type: "array",
        items: { type: "string" },
        description: "List of directory paths to validate",
        minItems: 1
      }
    },
    required: ["directories"],
    additionalProperties: false
  };
  
  if (enabledShells.length > 0) {
    schema.properties.shell = {
      type: "string",
      enum: enabledShells,
      description: "Optional: Validate against a specific shell's allowed paths instead of global paths"
    };
  }
  
  return schema;
}
