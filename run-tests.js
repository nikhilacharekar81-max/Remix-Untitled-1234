import { spawn } from 'child_process';

console.log('Running WorkPerHour Financial & Security Audit Test Suite...');

const child = spawn('npx', ['tsx', '--test', 'tests/**/*.test.ts'], { stdio: 'inherit', shell: true });

child.on('close', (code) => {
  console.log(`Test process exited with code ${code}`);
  process.exit(code || 0);
});
