#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Trỏ thẳng đến file mã nguồn TypeScript gốc
const serverPath = path.join(__dirname, '../server.ts');

// Gọi npx tsx để thực thi trực tiếp file .ts
const server = spawn('npx', ['tsx', `"${serverPath}"`], {
  stdio: 'inherit',
  shell: true
});

process.on('SIGINT', () => {
  server.kill();
  process.exit();
});
