#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const serverPath = path.resolve(__dirname, '..', 'server.js');
const child = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
