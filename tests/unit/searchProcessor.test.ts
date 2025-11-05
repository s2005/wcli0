/**
 * Unit tests for SearchProcessor
 */

import { describe, test, expect } from '@jest/globals';
import { SearchProcessor } from '../../src/utils/searchProcessor.js';
import { LogResourceError, LogErrorType } from '../../src/types/logging.js';

describe('SearchProcessor', () => {
  const sampleLog = `Line 1: Starting application
Line 2: Loading configuration
Line 3: ERROR: Failed to load config
Line 4: Retrying...
Line 5: SUCCESS: Configuration loaded
Line 6: Starting server
Line 7: Error: Port 8080 already in use
Line 8: Trying port 8081
Line 9: Server started successfully
Line 10: ERROR: Database connection failed`;

  describe('search', () => {
    test('should find single match', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'Database',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.totalOccurrences).toBe(1);
      expect(result.occurrenceNumber).toBe(1);
      expect(result.matchLineNumber).toBe(10);
      expect(result.matchLine).toContain('Database');
    });

    test('should find multiple matches', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 2,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.totalOccurrences).toBe(2);
      expect(result.matchLineNumber).toBe(3);
      expect(result.matchLine).toContain('ERROR: Failed to load config');
    });

    test('should navigate between occurrences', () => {
      const result1 = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      const result2 = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 2,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result1.matchLineNumber).toBe(3);
      expect(result2.matchLineNumber).toBe(10);
      expect(result1.matchLine).not.toBe(result2.matchLine);
    });

    test('should support case insensitive search', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'error',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: true,
        lineNumbers: true
      });

      // Should find 'ERROR' and 'Error'
      expect(result.totalOccurrences).toBe(3);
    });

    test('should support regex patterns', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR:.*failed',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: true,
        lineNumbers: true
      });

      expect(result.totalOccurrences).toBeGreaterThan(0);
      expect(result.matchLine).toMatch(/ERROR:.*failed/i);
    });

    test('should extract context lines', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'Retrying',
        contextLines: 2,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.beforeContext.length).toBe(2);
      expect(result.afterContext.length).toBe(2);
      expect(result.beforeContext[0]).toContain('Loading configuration');
      expect(result.beforeContext[1]).toContain('ERROR: Failed to load config');
      expect(result.afterContext[0]).toContain('SUCCESS');
      expect(result.afterContext[1]).toContain('Starting server');
    });

    test('should handle context at start of file', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'Starting application',
        contextLines: 3,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.beforeContext.length).toBe(0);
      expect(result.afterContext.length).toBeGreaterThan(0);
    });

    test('should handle context at end of file', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'Database connection failed',
        contextLines: 3,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.beforeContext.length).toBeGreaterThan(0);
      expect(result.afterContext.length).toBe(0);
    });

    test('should handle zero context lines', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'Retrying',
        contextLines: 0,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.beforeContext.length).toBe(0);
      expect(result.afterContext.length).toBe(0);
    });
  });

  describe('error handling', () => {
    test('should throw on no matches', () => {
      expect(() => {
        SearchProcessor.search(sampleLog, {
          pattern: 'NONEXISTENT',
          contextLines: 2,
          occurrence: 1,
          caseInsensitive: false,
          lineNumbers: true
        });
      }).toThrow(LogResourceError);

      try {
        SearchProcessor.search(sampleLog, {
          pattern: 'NONEXISTENT',
          contextLines: 2,
          occurrence: 1,
          caseInsensitive: false,
          lineNumbers: true
        });
      } catch (error) {
        expect(error).toBeInstanceOf(LogResourceError);
        expect((error as LogResourceError).type).toBe(LogErrorType.NO_MATCHES);
        expect((error as LogResourceError).message).toContain('No matches found');
      }
    });

    test('should throw on invalid occurrence (too high)', () => {
      expect(() => {
        SearchProcessor.search(sampleLog, {
          pattern: 'ERROR',
          contextLines: 2,
          occurrence: 10,
          caseInsensitive: false,
          lineNumbers: true
        });
      }).toThrow(LogResourceError);

      try {
        SearchProcessor.search(sampleLog, {
          pattern: 'ERROR',
          contextLines: 2,
          occurrence: 10,
          caseInsensitive: false,
          lineNumbers: true
        });
      } catch (error) {
        expect(error).toBeInstanceOf(LogResourceError);
        expect((error as LogResourceError).type).toBe(LogErrorType.INVALID_OCCURRENCE);
        expect((error as LogResourceError).message).toContain('out of range');
      }
    });

    test('should throw on invalid occurrence (zero)', () => {
      expect(() => {
        SearchProcessor.search(sampleLog, {
          pattern: 'ERROR',
          contextLines: 2,
          occurrence: 0,
          caseInsensitive: false,
          lineNumbers: true
        });
      }).toThrow(LogResourceError);
    });

    test('should throw on invalid occurrence (negative)', () => {
      expect(() => {
        SearchProcessor.search(sampleLog, {
          pattern: 'ERROR',
          contextLines: 2,
          occurrence: -1,
          caseInsensitive: false,
          lineNumbers: true
        });
      }).toThrow(LogResourceError);
    });

    test('should throw on invalid regex', () => {
      expect(() => {
        SearchProcessor.search(sampleLog, {
          pattern: '[invalid',
          contextLines: 2,
          occurrence: 1,
          caseInsensitive: false,
          lineNumbers: true
        });
      }).toThrow(LogResourceError);

      try {
        SearchProcessor.search(sampleLog, {
          pattern: '[invalid',
          contextLines: 2,
          occurrence: 1,
          caseInsensitive: false,
          lineNumbers: true
        });
      } catch (error) {
        expect(error).toBeInstanceOf(LogResourceError);
        expect((error as LogResourceError).type).toBe(LogErrorType.INVALID_SEARCH);
        expect((error as LogResourceError).message).toContain('Invalid regex pattern');
      }
    });
  });

  describe('formatting', () => {
    test('should format with line numbers', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.fullOutput).toMatch(/\d+: /);
      expect(result.fullOutput).toContain('>>>');
      expect(result.fullOutput).toContain('<<<');
    });

    test('should format without line numbers', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: false
      });

      // Should still have >>> <<< for match highlighting
      expect(result.fullOutput).toContain('>>>');
      expect(result.fullOutput).toContain('<<<');

      // But should not have line number prefixes on context lines
      const lines = result.fullOutput.split('\n');
      const contextLines = lines.filter(l => !l.includes('>>>'));
      const hasLineNumbers = contextLines.some(l => /^\d+: /.test(l));
      expect(hasLineNumbers).toBe(false);
    });

    test('should include navigation hint for non-last occurrence', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.fullOutput).toContain('occurrence=2');
    });

    test('should not include navigation hint for last occurrence', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 2,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.fullOutput).not.toContain('occurrence=3');
    });

    test('should include occurrence count in header', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.fullOutput).toContain('found 2 occurrence(s)');
      expect(result.fullOutput).toContain('Showing occurrence 1 of 2');
    });

    test('should include line number in header', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'Retrying',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.fullOutput).toContain('at line 4:');
    });
  });

  describe('countMatches', () => {
    test('should count matches correctly', () => {
      const count = SearchProcessor.countMatches(sampleLog, 'ERROR', false);
      expect(count).toBe(2);
    });

    test('should count case insensitive matches', () => {
      const count = SearchProcessor.countMatches(sampleLog, 'error', true);
      expect(count).toBe(3); // ERROR + Error
    });

    test('should return 0 for no matches', () => {
      const count = SearchProcessor.countMatches(sampleLog, 'NONEXISTENT', false);
      expect(count).toBe(0);
    });

    test('should handle regex patterns', () => {
      const count = SearchProcessor.countMatches(sampleLog, 'Line \\d+:', false);
      expect(count).toBe(10);
    });

    test('should throw on invalid regex', () => {
      expect(() => {
        SearchProcessor.countMatches(sampleLog, '[invalid', false);
      }).toThrow(LogResourceError);
    });
  });

  describe('edge cases', () => {
    test('should handle empty output', () => {
      expect(() => {
        SearchProcessor.search('', {
          pattern: 'test',
          contextLines: 1,
          occurrence: 1,
          caseInsensitive: false,
          lineNumbers: true
        });
      }).toThrow(LogResourceError);
    });

    test('should handle single line output with match', () => {
      const result = SearchProcessor.search('single line with ERROR', {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.totalOccurrences).toBe(1);
      expect(result.beforeContext.length).toBe(0);
      expect(result.afterContext.length).toBe(0);
    });

    test('should handle special regex characters literally', () => {
      const output = 'Line with [brackets] and (parens)';
      const result = SearchProcessor.search(output, {
        pattern: '\\[brackets\\]',
        contextLines: 0,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: false
      });

      expect(result.totalOccurrences).toBe(1);
    });

    test('should handle Unicode in pattern and output', () => {
      const output = 'Line 1: 日本語\nLine 2: 🚀 emoji\nLine 3: test';
      const result = SearchProcessor.search(output, {
        pattern: '🚀',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.totalOccurrences).toBe(1);
      expect(result.matchLine).toContain('🚀');
    });

    test('should handle very long lines', () => {
      const longLine = 'x'.repeat(10000);
      const output = `line1\n${longLine}ERROR${longLine}\nline3`;
      const result = SearchProcessor.search(output, {
        pattern: 'ERROR',
        contextLines: 0,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: false
      });

      expect(result.totalOccurrences).toBe(1);
      expect(result.matchLine).toContain('ERROR');
    });

    test('should handle multiple matches on same line as one occurrence', () => {
      const output = 'ERROR ERROR ERROR in one line';
      const result = SearchProcessor.search(output, {
        pattern: 'ERROR',
        contextLines: 0,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: false
      });

      // Should count as 1 occurrence (line-based matching)
      expect(result.totalOccurrences).toBe(1);
    });

    test('should handle large context request', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'Retrying',
        contextLines: 100,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      // Should not throw, context should be capped at available lines
      expect(result.beforeContext.length).toBeLessThan(100);
      expect(result.afterContext.length).toBeLessThan(100);
    });

    test('should preserve whitespace in matched lines', () => {
      const output = 'line with  spaces ERROR\n\t\ttabbed line\nnormal line';
      const result = SearchProcessor.search(output, {
        pattern: 'ERROR',
        contextLines: 0,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: false
      });

      // Should preserve spaces in the matched line
      expect(result.matchLine).toContain('  ');
      expect(result.matchLine).toContain('ERROR');
    });
  });
});
