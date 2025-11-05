/**
 * Utility for processing line range queries on log output
 */

import { RangeOptions, LogResourceError, LogErrorType } from '../types/logging.js';

/**
 * Processes line range queries with support for negative indices
 */
export class LineRangeProcessor {
  /**
   * Process a range query on output
   *
   * @param output - The full output string
   * @param start - Start line number (1-based, negative supported)
   * @param end - End line number (1-based, negative supported)
   * @param options - Range options
   * @returns Formatted range output
   */
  static processRange(
    output: string,
    start: number,
    end: number,
    options: RangeOptions
  ): string {
    const lines = output.split('\n');
    const totalLines = lines.length;

    // Convert negative indices to positive
    // -1 means last line, -2 means second to last, etc.
    const actualStart = start < 0 ? totalLines + start + 1 : start;
    const actualEnd = end < 0 ? totalLines + end + 1 : end;

    // Validate range
    this.validateRange(actualStart, actualEnd, totalLines);

    // Extract lines (convert to 0-based for array indexing)
    const selectedLines = lines.slice(actualStart - 1, actualEnd);

    // Check maxLines limit if specified
    if (options.maxLines && selectedLines.length > options.maxLines) {
      throw new LogResourceError(
        LogErrorType.INVALID_RANGE,
        `Range exceeds maximum line limit of ${options.maxLines}`,
        { requestedLines: selectedLines.length, maxLines: options.maxLines }
      );
    }

    // Format output
    return this.formatLines(
      selectedLines,
      actualStart,
      actualEnd,
      totalLines,
      options
    );
  }

  /**
   * Validate that the range is valid
   */
  private static validateRange(
    start: number,
    end: number,
    totalLines: number
  ): void {
    if (start < 1) {
      throw new LogResourceError(
        LogErrorType.INVALID_RANGE,
        `Start line must be >= 1, got ${start}`,
        { start, totalLines }
      );
    }

    if (end > totalLines) {
      throw new LogResourceError(
        LogErrorType.INVALID_RANGE,
        `End line ${end} exceeds total lines ${totalLines}`,
        { end, totalLines }
      );
    }

    if (start > end) {
      throw new LogResourceError(
        LogErrorType.INVALID_RANGE,
        `Start line ${start} must be <= end line ${end}`,
        { start, end }
      );
    }
  }

  /**
   * Format lines with optional line numbers and header
   */
  private static formatLines(
    lines: string[],
    startLineNumber: number,
    endLineNumber: number,
    totalLines: number,
    options: RangeOptions
  ): string {
    const parts: string[] = [];

    // Header
    parts.push(`Lines ${startLineNumber}-${endLineNumber} of ${totalLines}:`);
    parts.push('');

    // Format lines
    if (options.lineNumbers) {
      lines.forEach((line, index) => {
        const lineNum = startLineNumber + index;
        parts.push(`${lineNum}: ${line}`);
      });
    } else {
      parts.push(...lines);
    }

    return parts.join('\n');
  }

  /**
   * Calculate the actual range after resolving negative indices
   */
  static resolveRange(
    start: number,
    end: number,
    totalLines: number
  ): { actualStart: number; actualEnd: number } {
    const actualStart = start < 0 ? totalLines + start + 1 : start;
    const actualEnd = end < 0 ? totalLines + end + 1 : end;

    return { actualStart, actualEnd };
  }
}
