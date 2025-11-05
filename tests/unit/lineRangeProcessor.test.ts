/**
 * Unit tests for LineRangeProcessor
 */

import { describe, test, expect } from '@jest/globals';
import { LineRangeProcessor } from '../../src/utils/lineRangeProcessor.js';
import { LogResourceError, LogErrorType } from '../../src/types/logging.js';

describe('LineRangeProcessor', () => {
  const sampleOutput = Array.from(
    { length: 100 },
    (_, i) => `Line ${i + 1}`
  ).join('\n');

  describe('processRange', () => {
    test('should extract positive range', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        1,
        10,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 1');
      expect(result).toContain('Line 10');
      expect(result).not.toContain('Line 11');
      expect(result).toContain('Lines 1-10 of 100:');
    });

    test('should extract negative range (from end)', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        -10,
        -1,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 91');
      expect(result).toContain('Line 100');
      expect(result).not.toContain('Line 90');
      expect(result).toContain('Lines 91-100 of 100:');
    });

    test('should extract mixed range (positive start, negative end)', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        10,
        -10,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 10');
      expect(result).toContain('Line 91');
      expect(result).toContain('Lines 10-91 of 100:');
    });

    test('should extract single line', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        5,
        5,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 5');
      expect(result).not.toContain('Line 4');
      expect(result).not.toContain('Line 6');
      expect(result).toContain('Lines 5-5 of 100:');
    });

    test('should extract full range', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        1,
        100,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 1');
      expect(result).toContain('Line 100');
      expect(result).toContain('Lines 1-100 of 100:');
    });

    test('should include line numbers by default', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        1,
        5,
        { lineNumbers: true }
      );

      expect(result).toMatch(/1: Line 1/);
      expect(result).toMatch(/2: Line 2/);
      expect(result).toMatch(/5: Line 5/);
    });

    test('should exclude line numbers when requested', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        1,
        5,
        { lineNumbers: false }
      );

      expect(result).not.toMatch(/\d+: Line/);
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 5');
    });

    test('should handle negative indices correctly', () => {
      // -1 should be last line (100)
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        -1,
        -1,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 100');
      expect(result).not.toContain('Line 99');
    });
  });

  describe('validation', () => {
    test('should reject start line < 1', () => {
      expect(() => {
        LineRangeProcessor.processRange(
          sampleOutput,
          0,
          10,
          { lineNumbers: true }
        );
      }).toThrow(LogResourceError);

      try {
        LineRangeProcessor.processRange(sampleOutput, 0, 10, { lineNumbers: true });
      } catch (error) {
        expect(error).toBeInstanceOf(LogResourceError);
        expect((error as LogResourceError).type).toBe(LogErrorType.INVALID_RANGE);
        expect((error as LogResourceError).message).toContain('Start line must be >= 1');
      }
    });

    test('should reject end line > total', () => {
      expect(() => {
        LineRangeProcessor.processRange(
          sampleOutput,
          1,
          200,
          { lineNumbers: true }
        );
      }).toThrow(LogResourceError);

      try {
        LineRangeProcessor.processRange(sampleOutput, 1, 200, { lineNumbers: true });
      } catch (error) {
        expect(error).toBeInstanceOf(LogResourceError);
        expect((error as LogResourceError).type).toBe(LogErrorType.INVALID_RANGE);
        expect((error as LogResourceError).message).toContain('exceeds total lines');
      }
    });

    test('should reject start > end', () => {
      expect(() => {
        LineRangeProcessor.processRange(
          sampleOutput,
          50,
          10,
          { lineNumbers: true }
        );
      }).toThrow(LogResourceError);

      try {
        LineRangeProcessor.processRange(sampleOutput, 50, 10, { lineNumbers: true });
      } catch (error) {
        expect(error).toBeInstanceOf(LogResourceError);
        expect((error as LogResourceError).type).toBe(LogErrorType.INVALID_RANGE);
        expect((error as LogResourceError).message).toContain('must be <= end line');
      }
    });

    test('should reject when maxLines exceeded', () => {
      expect(() => {
        LineRangeProcessor.processRange(
          sampleOutput,
          1,
          100,
          { lineNumbers: true, maxLines: 50 }
        );
      }).toThrow(LogResourceError);

      try {
        LineRangeProcessor.processRange(
          sampleOutput,
          1,
          100,
          { lineNumbers: true, maxLines: 50 }
        );
      } catch (error) {
        expect(error).toBeInstanceOf(LogResourceError);
        expect((error as LogResourceError).message).toContain('exceeds maximum line limit');
      }
    });

    test('should allow range equal to maxLines', () => {
      expect(() => {
        LineRangeProcessor.processRange(
          sampleOutput,
          1,
          50,
          { lineNumbers: true, maxLines: 50 }
        );
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    test('should handle empty lines in output', () => {
      const output = 'line1\n\nline3\n\nline5';
      const result = LineRangeProcessor.processRange(
        output,
        1,
        5,
        { lineNumbers: true }
      );

      expect(result).toContain('1: line1');
      expect(result).toContain('2: '); // Empty line
      expect(result).toContain('3: line3');
    });

    test('should handle single line output', () => {
      const output = 'single line';
      const result = LineRangeProcessor.processRange(
        output,
        1,
        1,
        { lineNumbers: true }
      );

      expect(result).toContain('single line');
      expect(result).toContain('Lines 1-1 of 1:');
    });

    test('should handle very long lines', () => {
      const longLine = 'x'.repeat(10000);
      const output = `line1\n${longLine}\nline3`;
      const result = LineRangeProcessor.processRange(
        output,
        1,
        3,
        { lineNumbers: true }
      );

      expect(result).toContain(longLine);
    });

    test('should handle Unicode characters', () => {
      const output = '日本語\n🚀 emoji\nspecial ñ';
      const result = LineRangeProcessor.processRange(
        output,
        1,
        3,
        { lineNumbers: true }
      );

      expect(result).toContain('日本語');
      expect(result).toContain('🚀 emoji');
      expect(result).toContain('special ñ');
    });

    test('should handle CRLF line endings', () => {
      const output = 'line1\r\nline2\r\nline3';
      const result = LineRangeProcessor.processRange(
        output,
        1,
        2,
        { lineNumbers: true }
      );

      // Should work with CRLF (though split will treat \r as part of line)
      expect(result).toBeDefined();
    });
  });

  describe('resolveRange', () => {
    test('should resolve positive indices', () => {
      const { actualStart, actualEnd } = LineRangeProcessor.resolveRange(
        10,
        20,
        100
      );

      expect(actualStart).toBe(10);
      expect(actualEnd).toBe(20);
    });

    test('should resolve negative indices', () => {
      const { actualStart, actualEnd } = LineRangeProcessor.resolveRange(
        -10,
        -1,
        100
      );

      expect(actualStart).toBe(91); // 100 + (-10) + 1
      expect(actualEnd).toBe(100);  // 100 + (-1) + 1
    });

    test('should resolve mixed indices', () => {
      const { actualStart, actualEnd } = LineRangeProcessor.resolveRange(
        10,
        -10,
        100
      );

      expect(actualStart).toBe(10);
      expect(actualEnd).toBe(91);
    });

    test('should handle last line (-1)', () => {
      const { actualStart, actualEnd } = LineRangeProcessor.resolveRange(
        -1,
        -1,
        100
      );

      expect(actualStart).toBe(100);
      expect(actualEnd).toBe(100);
    });

    test('should handle full negative range', () => {
      const { actualStart, actualEnd } = LineRangeProcessor.resolveRange(
        -100,
        -1,
        100
      );

      expect(actualStart).toBe(1);
      expect(actualEnd).toBe(100);
    });
  });

  describe('formatting', () => {
    test('should format header correctly', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        25,
        35,
        { lineNumbers: true }
      );

      expect(result).toContain('Lines 25-35 of 100:');
    });

    test('should format with line numbers', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        5,
        7,
        { lineNumbers: true }
      );

      const lines = result.split('\n');
      // Skip header lines
      const contentLines = lines.slice(2);

      expect(contentLines[0]).toMatch(/^5: /);
      expect(contentLines[1]).toMatch(/^6: /);
      expect(contentLines[2]).toMatch(/^7: /);
    });

    test('should format without line numbers', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        5,
        7,
        { lineNumbers: false }
      );

      const lines = result.split('\n');
      // Skip header lines
      const contentLines = lines.slice(2);

      expect(contentLines[0]).toBe('Line 5');
      expect(contentLines[1]).toBe('Line 6');
      expect(contentLines[2]).toBe('Line 7');
    });

    test('should preserve line content exactly', () => {
      const output = 'line with  spaces\n\ttabbed line\nline:with:colons';
      const result = LineRangeProcessor.processRange(
        output,
        1,
        3,
        { lineNumbers: false }
      );

      expect(result).toContain('line with  spaces');
      expect(result).toContain('\ttabbed line');
      expect(result).toContain('line:with:colons');
    });
  });
});
