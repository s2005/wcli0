export default async function globalTeardown() {
  process.stdin.removeAllListeners('data');
  process.stdin.removeAllListeners('error');
  process.stdout.removeAllListeners('drain');
  process.stdout.removeAllListeners('error');
}
console.log('global teardown executed');
