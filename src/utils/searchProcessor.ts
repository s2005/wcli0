/**
 * Utility for searching log output with context
 */

import {
  SearchOptions,
  SearchResult,
  SearchMatch,
  LogResourceError,
  LogErrorType
} from '../types/logging.js';

/**
 * Processes search queries with context and occurrence handling
 */
export class SearchProcessor {
  /**
   * Search for a pattern in output and return results with context
   *
   * @param output - The full output string to search
   * @param options - Search options
   * @returns Search result with context
   */
  static search(
    output: string,
    options: SearchOptions
  ): SearchResult {
    const lines = output.split('\n');

    // Find all matches
    const matches = this.findMatches(lines, options);

    if (matches.length === 0) {
      throw new LogResourceError(
        LogErrorType.NO_MATCHES,
        `No matches found for pattern: ${options.pattern}`,
        { pattern: options.pattern, caseInsensitive: options.caseInsensitive }
      );
    }

    // Validate occurrence
    if (options.occurrence < 1 || options.occurrence > matches.length) {
      throw new LogResourceError(
        LogErrorType.INVALID_OCCURRENCE,
        `Occurrence ${options.occurrence} out of range (1-${matches.length})`,
        { occurrence: options.occurrence, total: matches.length }
      );
    }

    // Get the specific occurrence (convert from 1-based to 0-based)
    const match = matches[options.occurrence - 1];

    // Extract context around the match
    const context = this.extractContext(
      lines,
      match.lineNumber - 1, // Convert to 0-based index
      options.contextLines
    );

    // Format the result
    const fullOutput = this.formatSearchResult(
      context.before,
      match.line,
      context.after,
      match.lineNumber,
      options.occurrence,
      matches.length,
      options
    );

    return {
      occurrenceNumber: options.occurrence,
      totalOccurrences: matches.length,
      matchLineNumber: match.lineNumber,
      beforeContext: context.before,
      matchLine: match.line,
      afterContext: context.after,
      fullOutput: fullOutput
    };
  }

  /**
   * Find all matches in the lines
   */
  private static findMatches(
    lines: string[],
    options: SearchOptions
  ): SearchMatch[] {
    const matches: SearchMatch[] = [];

    try {
      const flags = options.caseInsensitive ? 'i' : '';
      const regex = new RegExp(options.pattern, flags);

      lines.forEach((line, index) => {
        if (regex.test(line)) {
          matches.push({
            lineNumber: index + 1, // 1-based line numbers
            line: line
          });
        }
      });
    } catch (error) {
      throw new LogResourceError(
        LogErrorType.INVALID_SEARCH,
        `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
        { pattern: options.pattern }
      );
    }

    return matches;
  }

  /**
   * Extract context lines around a match
   */
  private static extractContext(
    lines: string[],
    matchIndex: number,
    contextLines: number
  ): { before: string[]; after: string[] } {
    const startIndex = Math.max(0, matchIndex - contextLines);
    const endIndex = Math.min(lines.length - 1, matchIndex + contextLines);

    return {
      before: lines.slice(startIndex, matchIndex),
      after: lines.slice(matchIndex + 1, endIndex + 1)
    };
  }

  /**
   * Format search result with header and context
   */
  private static formatSearchResult(
    before: string[],
    match: string,
    after: string[],
    lineNumber: number,
    occurrence: number,
    totalOccurrences: number,
    options: SearchOptions
  ): string {
    const parts: string[] = [];

    // Header
    parts.push(
      `Search: "${options.pattern}" found ${totalOccurrences} occurrence(s)`
    );
    parts.push(
      `Showing occurrence ${occurrence} of ${totalOccurrences} at line ${lineNumber}:`
    );
    parts.push('');

    // Context before
    if (before.length > 0) {
      const startLineNum = lineNumber - before.length;
      if (options.lineNumbers) {
        before.forEach((line, i) => {
          const num = startLineNum + i;
          parts.push(`${num}: ${line}`);
        });
      } else {
        parts.push(...before);
      }
    }

    // Match line (highlighted with markers)
    if (options.lineNumbers) {
      parts.push(`>>> ${lineNumber}: ${match} <<<`);
    } else {
      parts.push(`>>> ${match} <<<`);
    }

    // Context after
    if (after.length > 0) {
      if (options.lineNumbers) {
        after.forEach((line, i) => {
          const num = lineNumber + i + 1;
          parts.push(`${num}: ${line}`);
        });
      } else {
        parts.push(...after);
      }
    }

    // Navigation hint
    if (occurrence < totalOccurrences) {
      parts.push('');
      parts.push(
        `To see next match, use occurrence=${occurrence + 1}`
      );
    }

    return parts.join('\n');
  }

  /**
   * Count total occurrences of a pattern (without full search)
   */
  static countMatches(output: string, pattern: string, caseInsensitive: boolean = false): number {
    const lines = output.split('\n');
    try {
      const flags = caseInsensitive ? 'i' : '';
      const regex = new RegExp(pattern, flags);

      let count = 0;
      lines.forEach(line => {
        if (regex.test(line)) {
          count++;
        }
      });

      return count;
    } catch (error) {
      throw new LogResourceError(
        LogErrorType.INVALID_SEARCH,
        `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
        { pattern }
      );
    }
  }
}
