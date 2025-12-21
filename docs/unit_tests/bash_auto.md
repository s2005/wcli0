# bash_auto Unit Tests

## Test File
`src/shells/__tests__/bash_auto.test.ts`

## Purpose
Tests the `BashAutoPlugin` which automatically selects between Bash and Git Bash based on the host platform.

## Test Cases

### Platform Selection
| Test | Description |
|------|-------------|
| `uses Bash defaults on linux platforms` | Verifies Bash is selected on Linux |
| `uses Git Bash defaults on win32 platforms` | Verifies Git Bash is selected on Windows |
| `uses Bash defaults on darwin (macOS) platforms` | Verifies Bash is selected on macOS |

### Delegation
| Test | Description |
|------|-------------|
| `delegates validation to the selected implementation on $platform` | Parameterized test for linux, darwin, and win32 platforms verifying command validation and config merging is delegated correctly |

## Test Strategy

### Platform Mocking
The tests use `Object.defineProperty` to mock `process.platform`:

```typescript
const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value: platform });
};
```

The platform is restored after each test via `afterEach`.

### Coverage Areas
- Default shell command selection per platform
- Display name generation
- Blocked command inheritance
- Command validation delegation
- Config merging delegation

## Running Tests
```bash
npm test -- --testPathPattern="bash_auto.test"
```
