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
    
    // Add path format information
    if (shellName === 'wsl') {
      lines.push(`- Path format: Unix-style (/home/user, /mnt/c/...)`);
      if (config.wslConfig?.inheritGlobalPaths) {
        lines.push(`- Inherits global Windows paths (converted to /mnt/...)`);
      }
    } else if (shellName === 'cmd' || shellName === 'powershell') {
      lines.push(`- Path format: Windows-style (C:\\Users\\...)`);
    } else if (shellName === 'gitbash') {
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
  lines.push('- `configuration`: The server configuration with global and shell-specific settings');
  lines.push('- `resolvedShells`: Effective configuration for each enabled shell after merging');
  lines.push('');
  lines.push('The resolved configuration shows what settings are actually used for each shell,');
  lines.push('including inherited global settings and shell-specific overrides.');
  
  return lines.join('\n');
}
