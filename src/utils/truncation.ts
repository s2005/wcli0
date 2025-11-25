/**
 * Utility functions for output truncation
 */

import { TruncatedOutput, TruncationConfig } from '../types/logging.js';
import path from 'path';

/**
 * Truncates command output to a maximum number of lines
 *
 * @param output - The full output string to truncate
 * @param maxLines - Maximum number of lines to return
 * @param config - Truncation configuration
 * @param executionId - Optional execution ID to include in message
 * @returns Truncated output with metadata
 */
export function truncateOutput(
  output: string,
  maxLines: number,
  config: TruncationConfig,
  executionId?: string,
  filePath?: string,
  exposeFullPath: boolean = false
): TruncatedOutput {
  // Handle empty output
  if (!output || output.length === 0) {
    return {
      output: '',
      wasTruncated: false,
      totalLines: 0,
      returnedLines: 0,
      message: null
    };
  }

  // Split into lines
  const lines = output.split('\n');
  const totalLines = lines.length;

  // Check if truncation is needed
  if (!config.enableTruncation || totalLines <= maxLines) {
    return {
      output: output,
      wasTruncated: false,
      totalLines: totalLines,
      returnedLines: totalLines,
      message: null
    };
  }

  // Take last maxLines lines
  const truncatedLines = lines.slice(-maxLines);
  const truncatedOutput = truncatedLines.join('\n');

  // Build truncation message
  const omittedLines = totalLines - maxLines;
  const message = buildTruncationMessage(
    omittedLines,
    totalLines,
    maxLines,
    executionId,
    config.truncationMessage,
    filePath,
    exposeFullPath
  );

  return {
    output: truncatedOutput,
    wasTruncated: true,
    totalLines: totalLines,
    returnedLines: maxLines,
    message: message
  };
}

/**
 * Builds a truncation message with template replacement
 *
 * @param omittedLines - Number of lines omitted
 * @param totalLines - Total number of lines in output
 * @param returnedLines - Number of lines being returned
 * @param executionId - Optional execution ID
 * @param template - Message template with placeholders
 * @returns Formatted truncation message
 */
export function buildTruncationMessage(
  omittedLines: number,
  totalLines: number,
  returnedLines: number,
  executionId?: string,
  template?: string,
  filePath?: string,
  exposeFullPath: boolean = false
): string {
  const defaultTemplate = '[Output truncated: Showing last {returnedLines} of {totalLines} lines]';
  const messageTemplate = template || defaultTemplate;

  // Replace placeholders
  let message = messageTemplate
    .replace('{omittedLines}', omittedLines.toString())
    .replace('{totalLines}', totalLines.toString())
    .replace('{returnedLines}', returnedLines.toString());

  // Add additional info lines
  const parts: string[] = [];
  parts.push(message);
  parts.push(`[${omittedLines} lines omitted]`);

  if (executionId) {
    if (filePath) {
      const displayPath = exposeFullPath ? filePath : path.basename(filePath);
      parts.push(`[Full log saved to: ${displayPath}]`);
    }
    parts.push(`[Access full output: cli://logs/commands/${executionId}]`);
  }

  return parts.join('\n');
}

/**
 * Formats the complete truncated output with message
 *
 * @param truncated - Truncated output result
 * @returns Formatted string with message and output
 */
export function formatTruncatedOutput(truncated: TruncatedOutput): string {
  if (!truncated.wasTruncated || !truncated.message) {
    return truncated.output;
  }

  return `${truncated.message}\n\n${truncated.output}`;
}
