let debugEnabled = false;

export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
}

export function debugLog(...args: unknown[]): void {
  if (debugEnabled) {
    console.error(...args);
  }
}

export function debugWarn(...args: unknown[]): void {
  if (debugEnabled) {
    console.warn(...args);
  }
}

export function errorLog(...args: unknown[]): void {
  console.error(...args);
}
