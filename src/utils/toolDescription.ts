import type { ResolvedShellConfig } from '../types/config.js';

/**
 * Builds the tool description dynamically based on enabled shells
 * @param allowedShells Array of enabled shell names
 * @returns Array of description lines
 */
export function buildToolDescription(allowedShells: string[]): string[] {
  const descriptionLines: string[] = [
    `Execute a command in the specified shell (${allowedShells.join(', ')})`,
    "",
    "**IMPORTANT GUIDELINES:**",
    "1. ALWAYS use the `workingDir` parameter to specify the working directory",
    "2. Request config of this MCP server configuration using tools",
    "3. Follow limitations taken from configuration",
    "4. Use validate_directories tool to validate directories before execution",
    "",
    "**Best Practices:**",
    "- Specify the full, absolute path in the `workingDir` parameter",
    "- Use the shell's full command for complex operations instead of chaining",
    "- Ensure you have proper permissions for the specified working directory",
    ""
  ];

  // Add examples for each enabled shell
  if (allowedShells.includes('powershell')) {
    descriptionLines.push(
      "Example usage (PowerShell):",
      "```json",
      "{",
      "  \"shell\": \"powershell\",",
      "  \"command\": \"Get-Process | Select-Object -First 5\",",
      "  \"workingDir\": \"C:\\Users\\username\"",
      "}",
      "```",
      ""
    );
  }

  if (allowedShells.includes('cmd')) {
    descriptionLines.push(
      "Example usage (CMD):",
      "```json",
      "{",
      "  \"shell\": \"cmd\",",
      "  \"command\": \"dir /b\",",
      "  \"workingDir\": \"C:\\Projects\"",
      "}",
      "```",
      ""
    );
  }

  if (allowedShells.includes('gitbash')) {
    descriptionLines.push(
      "Example usage (Git Bash):",
      "```json",
      "{",
      "  \"shell\": \"gitbash\",",
      "  \"command\": \"ls -la\",",
      "  \"workingDir\": \"/c/Users/username\"",
      "}",
      "```",
      ""
    );
  }

  if (allowedShells.includes('bash')) {
    descriptionLines.push(
      "Example usage (Bash):",
      "```json",
      "{",
      "  \"shell\": \"bash\",",
      "  \"command\": \"ls -la\",",
      "  \"workingDir\": \"/home/user\"",
      "}",
      "```",
      ""
    );
  }

  return descriptionLines;
}

/**
 * Build tool description with resolved shell information
 * @param resolvedConfigs Map of shell names to their resolved configurations
 * @returns Full description for execute_command tool
 */
export function buildExecuteCommandDescription(
  resolvedConfigs: Map<string, ResolvedShellConfig>
): string {
  const lines: string[] = [];
  const shellNames = Array.from(resolvedConfigs.keys());
  
  lines.push(`Execute a command in the specified shell (${shellNames.join(', ')})`);
  lines.push('');
  lines.push('**IMPORTANT GUIDELINES:**');
  lines.push('1. ALWAYS use the `workingDir` parameter to specify the working directory');
  lines.push('2. Request config of this MCP server configuration using tools');
  lines.push('3. Follow limitations taken from configuration');
  lines.push('4. Use validate_directories tool to validate directories before execution');
  lines.push('');
  lines.push('**Shell-Specific Settings:**');
  lines.push('');
  
  // Add summary of each shell's configuration
  for (const [shellName, config] of resolvedConfigs) {
    lines.push(`**${shellName}:**`);
    lines.push(`- Command timeout: ${config.security.commandTimeout}s`);
    lines.push(`- Max command length: ${config.security.maxCommandLength} characters`);
    lines.push(`- Injection protection: ${config.security.enableInjectionProtection ? 'enabled' : 'disabled'}`);
    
    if (config.restrictions.blockedOperators.length > 0) {
      lines.push(`- Blocked operators: ${config.restrictions.blockedOperators.join(', ')}`);
    }
    
    // Add path format information based on shell type
    if (config.type === 'wsl' || config.type === 'bash') {
      lines.push(`- Path format: Unix-style (/home/user, /mnt/c/...)`);
      if (config.wslConfig?.inheritGlobalPaths) {
        lines.push(`- Inherits global Windows paths (converted to /mnt/...)`);
      }
    } else if (config.type === 'cmd' || config.type === 'powershell') {
      lines.push(`- Path format: Windows-style (C:\\Users\\...)`);
    } else if (config.type === 'gitbash') {
      lines.push(`- Path format: Mixed (C:\\... or /c/...)`);
    }
    
    lines.push('');
  }
  
  lines.push('**Working Directory:**');
  lines.push('- If omitted, uses the server\'s current directory');
  lines.push('- Must be within allowed paths for the selected shell');
  lines.push('- Must use the correct format for the shell type');
  lines.push('');
  
  // Add examples
  lines.push('**Examples:**');
  lines.push('');
  
  if (resolvedConfigs.has('cmd')) {
    lines.push('Windows CMD:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "shell": "cmd",');
    lines.push('  "command": "dir /b",');
    lines.push('  "workingDir": "C:\\Projects"');
    lines.push('}');
    lines.push('```');
    lines.push('');
  }
  
  if (resolvedConfigs.has('wsl')) {
    lines.push('WSL:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "shell": "wsl",');
    lines.push('  "command": "ls -la",');
    lines.push('  "workingDir": "/home/user"');
    lines.push('}');
    lines.push('```');
    lines.push('');
  }

  if (resolvedConfigs.has('bash')) {
    lines.push('Bash:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "shell": "bash",');
    lines.push('  "command": "ls -la",');
    lines.push('  "workingDir": "/home/user"');
    lines.push('}');
    lines.push('```');
    lines.push('');
  }
  
  if (resolvedConfigs.has('gitbash')) {
    lines.push('Git Bash:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "shell": "gitbash",');
    lines.push('  "command": "git status",');
    lines.push('  "workingDir": "/c/Projects/repo"  // or "C:\\Projects\\repo"');
    lines.push('}');
    lines.push('```');
  }
  
  return lines.join('\n');
}

/**
 * Build validate_directories tool description
 * @param hasShellSpecific Whether shell-specific validation is available
 * @returns Full description for validate_directories tool
 */
export function buildValidateDirectoriesDescription(
  hasShellSpecific: boolean
): string {
  const lines: string[] = [];
  
  lines.push('Check if directories are within allowed paths (only available when restrictWorkingDirectory is enabled)');
  lines.push('');
  
  if (hasShellSpecific) {
    lines.push('**Validation Modes:**');
    lines.push('- Global: Validates against server-wide allowed paths (default)');
    lines.push('- Shell-specific: Validates against a specific shell\'s allowed paths');
    lines.push('');
    lines.push('**Shell-Specific Validation:**');
    lines.push('Add the "shell" parameter to validate for a specific shell:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "directories": ["/home/user", "/tmp"],');
    lines.push('  "shell": "wsl"');
    lines.push('}');
    lines.push('```');
  } else {
    lines.push('Validates directories against the global allowed paths configuration.');
  }
  
  return lines.join('\n');
}

/**
 * Build get_config tool description
 * @returns Full description for get_config tool
 */
export function buildGetConfigDescription(): string {
  const lines: string[] = [];

  lines.push('Get the windows CLI server configuration');
  lines.push('');
  lines.push('**Returns:**');
  lines.push('- `global`: Default settings applied to all shells');
  lines.push('- `shells`: Enabled shells with any overrides applied');
  lines.push('');
  lines.push('Only enabled shells are included and technical fields like executables are omitted.');

  return lines.join('\n');
}
