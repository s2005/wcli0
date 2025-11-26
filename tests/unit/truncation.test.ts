/**
 * Unit tests for truncation utility
 */

import { describe, test, expect } from '@jest/globals';
import {
  truncateOutput,
  buildTruncationMessage,
  formatTruncatedOutput
} from '../../src/utils/truncation.js';
import { TruncationConfig } from '../../src/types/logging.js';

describe('truncateOutput', () => {
  const defaultConfig: TruncationConfig = {
    maxOutputLines: 20,
    enableTruncation: true,
    truncationMessage: '[Output truncated: Showing last {returnedLines} of {totalLines} lines]'
  };

  describe('basic functionality', () => {
    test('should not truncate output shorter than limit', () => {
      const output = 'line1\nline2\nline3';
      const result = truncateOutput(output, 10, defaultConfig);

      expect(result.wasTruncated).toBe(false);
      expect(result.output).toBe(output);
      expect(result.totalLines).toBe(3);
      expect(result.returnedLines).toBe(3);
      expect(result.message).toBeNull();
    });

    test('should truncate output longer than limit', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, defaultConfig);

      expect(result.wasTruncated).toBe(true);
      expect(result.totalLines).toBe(100);
      expect(result.returnedLines).toBe(20);
      expect(result.output).toContain('line 81'); // First of last 20
      expect(result.output).toContain('line 100'); // Last line
      expect(result.output.startsWith('line 81')).toBe(true); // Should start with line 81
      expect(result.output).not.toMatch(/^line 1\n/); // First line not included
    });

    test('should include truncation message', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, defaultConfig, 'exec-id-123');

      expect(result.message).toBeDefined();
      expect(result.message).toContain('Showing last 20 of 100 lines');
      expect(result.message).toContain('80 lines omitted');
      expect(result.message).toContain('exec-id-123');
    });

    test('should return last N lines', () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 10, defaultConfig);

      const resultLines = result.output.split('\n');
      expect(resultLines.length).toBe(10);
      expect(resultLines[0]).toBe('line 41');
      expect(resultLines[9]).toBe('line 50');
    });
  });

  describe('edge cases', () => {
    test('should handle empty output', () => {
      const result = truncateOutput('', 20, defaultConfig);

      expect(result.wasTruncated).toBe(false);
      expect(result.output).toBe('');
      expect(result.totalLines).toBe(0);
      expect(result.returnedLines).toBe(0);
    });

    test('should handle single line', () => {
      const result = truncateOutput('single line', 20, defaultConfig);

      expect(result.wasTruncated).toBe(false);
      expect(result.totalLines).toBe(1);
      expect(result.returnedLines).toBe(1);
    });

    test('should handle exactly at limit', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, defaultConfig);

      expect(result.wasTruncated).toBe(false);
      expect(result.totalLines).toBe(20);
      expect(result.returnedLines).toBe(20);
    });

    test('should handle one line over limit', () => {
      const lines = Array.from({ length: 21 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, defaultConfig);

      expect(result.wasTruncated).toBe(true);
      expect(result.totalLines).toBe(21);
      expect(result.returnedLines).toBe(20);
      expect(result.output).toContain('line 2');
      expect(result.output).toContain('line 21');
      expect(result.output.startsWith('line 2')).toBe(true); // Should start with line 2
      expect(result.output).not.toMatch(/^line 1\n/); // First line not included
    });

    test('should handle very long single line', () => {
      const output = 'a'.repeat(10000);
      const result = truncateOutput(output, 20, defaultConfig);

      expect(result.wasTruncated).toBe(false);
      expect(result.totalLines).toBe(1);
    });

    test('should handle output with empty lines', () => {
      const output = 'line1\n\nline3\n\nline5';
      const result = truncateOutput(output, 3, defaultConfig);

      expect(result.wasTruncated).toBe(true);
      expect(result.totalLines).toBe(5);
      expect(result.returnedLines).toBe(3);
    });
  });

  describe('configuration', () => {
    test('should respect truncation disabled', () => {
      const config: TruncationConfig = {
        ...defaultConfig,
        enableTruncation: false
      };

      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, config);

      expect(result.wasTruncated).toBe(false);
      expect(result.totalLines).toBe(100);
      expect(result.returnedLines).toBe(100);
      expect(result.output).toBe(output);
    });

    test('should respect custom message template', () => {
      const customConfig: TruncationConfig = {
        ...defaultConfig,
        truncationMessage: 'Custom: {returnedLines}/{totalLines}'
      };

      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, customConfig);

      expect(result.message).toContain('Custom: 20/100');
    });

    test('should handle no execution ID', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, defaultConfig, undefined);

      expect(result.message).toBeDefined();
      expect(result.message).not.toContain('cli://logs/commands/');
    });

    test('should handle different maxLines values', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');

      const result5 = truncateOutput(output, 5, defaultConfig);
      expect(result5.returnedLines).toBe(5);

      const result50 = truncateOutput(output, 50, defaultConfig);
      expect(result50.returnedLines).toBe(50);

      const result100 = truncateOutput(output, 100, defaultConfig);
      expect(result100.wasTruncated).toBe(false);
    });
  });
});

describe('buildTruncationMessage', () => {
  const template = '[Output truncated: Showing last {returnedLines} of {totalLines} lines]';

  test('should replace all placeholders', () => {
    const message = buildTruncationMessage(80, 100, 20, 'exec-123', template);

    expect(message).toContain('Showing last 20 of 100 lines');
    expect(message).toContain('80 lines omitted');
  });

  test('should include execution ID when provided', () => {
    const message = buildTruncationMessage(80, 100, 20, 'exec-123', template);

    expect(message).toContain('cli://logs/commands/exec-123');
  });

  test('should not include URI when no execution ID', () => {
    const message = buildTruncationMessage(80, 100, 20, undefined, template);

    expect(message).not.toContain('cli://logs/commands/');
  });

  test('should handle default template', () => {
    const message = buildTruncationMessage(50, 100, 50, undefined, undefined);

    expect(message).toBeDefined();
    expect(message.length).toBeGreaterThan(0);
  });

  test('should handle various line counts', () => {
    const message1 = buildTruncationMessage(1, 21, 20, undefined, template);
    expect(message1).toContain('1 lines omitted');

    const message99 = buildTruncationMessage(99, 100, 1, undefined, template);
    expect(message99).toContain('99 lines omitted');
  });

  test('should include basename when exposeFullPath is false', () => {
    const message = buildTruncationMessage(
      10,
      20,
      10,
      'exec-abc',
      template,
      'C:\\logs\\full\\run.log',
      false,
      true
    );

    expect(message).toContain('run.log');
    expect(message).not.toContain('C:\\logs\\full\\run.log');
    // When file path is provided, we don't show the fallback (file is simpler to access)
    expect(message).not.toContain('get_command_output');
    expect(message).not.toContain('cli://logs/commands');
  });

  test('should include full path when exposeFullPath is true', () => {
    const message = buildTruncationMessage(
      10,
      20,
      10,
      'exec-abc',
      template,
      'C:\\logs\\full\\run.log',
      true,
      true
    );

    expect(message).toContain('C:\\logs\\full\\run.log');
  });

  test('should omit resource link when log resources disabled', () => {
    const message = buildTruncationMessage(
      10,
      20,
      10,
      'exec-abc',
      template,
      'C:\\logs\\full\\run.log',
      false,
      false
    );

    // When file path is provided, only file path is shown (no MCP resource or tool)
    expect(message).not.toContain('cli://logs/commands/exec-abc');
    expect(message).not.toContain('get_command_output');
    expect(message).toContain('run.log');
  });

  test('should show MCP resource and tool when no file path (in-memory)', () => {
    const message = buildTruncationMessage(
      10,
      20,
      10,
      'exec-abc',
      template,
      undefined, // No file path
      false,
      true
    );

    expect(message).toContain('cli://logs/commands/exec-abc');
    expect(message).toContain('get_command_output');
  });

  test('should show nothing extra when no file path and log resources disabled', () => {
    const message = buildTruncationMessage(
      10,
      20,
      10,
      'exec-abc',
      template,
      undefined, // No file path
      false,
      false // Log resources disabled
    );

    expect(message).not.toContain('cli://logs/commands');
    expect(message).not.toContain('get_command_output');
    expect(message).not.toContain('Full log saved');
  });
});

describe('formatTruncatedOutput', () => {
  test('should return output without message when not truncated', () => {
    const truncated = {
      output: 'test output',
      wasTruncated: false,
      totalLines: 1,
      returnedLines: 1,
      message: null
    };

    const result = formatTruncatedOutput(truncated);
    expect(result).toBe('test output');
  });

  test('should combine message and output when truncated', () => {
    const truncated = {
      output: 'last line',
      wasTruncated: true,
      totalLines: 100,
      returnedLines: 1,
      message: '[Truncation message]'
    };

    const result = formatTruncatedOutput(truncated);
    expect(result).toContain('[Truncation message]');
    expect(result).toContain('last line');
    expect(result.indexOf('[Truncation message]')).toBeLessThan(result.indexOf('last line'));
  });

  test('should handle truncated but no message', () => {
    const truncated = {
      output: 'output',
      wasTruncated: true,
      totalLines: 100,
      returnedLines: 1,
      message: null
    };

    const result = formatTruncatedOutput(truncated);
    expect(result).toBe('output');
  });

  test('should preserve formatting in output', () => {
    const truncated = {
      output: 'line1\nline2\nline3',
      wasTruncated: true,
      totalLines: 100,
      returnedLines: 3,
      message: 'Message'
    };

    const result = formatTruncatedOutput(truncated);
    expect(result).toContain('line1\nline2\nline3');
  });
});
