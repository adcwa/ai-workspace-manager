const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const util = require('util');

const execFileAsync = util.promisify(execFile);
const port = Number(process.env.PORT || 4173);

const configDir = path.join(os.homedir(), '.ai-workspace-manager');
const configFile = path.join(configDir, 'config.json');
const publicDir = path.join(__dirname, 'public');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

async function ensureConfigFile() {
  await fsp.mkdir(configDir, { recursive: true });

  try {
    await fsp.access(configFile, fs.constants.F_OK);
  } catch {
    const defaultConfig = {
      activeWorkspace: '',
      workspaces: [],
    };

    await fsp.writeFile(configFile, `${JSON.stringify(defaultConfig, null, 2)}\n`, 'utf8');
  }
}

async function readConfig() {
  await ensureConfigFile();
  const raw = await fsp.readFile(configFile, 'utf8');
  return JSON.parse(raw);
}

async function writeConfig(config) {
  await ensureConfigFile();
  await fsp.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function validateWorkspace(workspace) {
  const missing = [];
  if (!workspace.id) missing.push('id');
  if (!workspace.name) missing.push('name');
  if (!workspace.baseRoot) missing.push('baseRoot');
  if (!workspace.workspaceRoot) missing.push('workspaceRoot');
  if (!Array.isArray(workspace.repos) || workspace.repos.length === 0) missing.push('repos');

  if (missing.length > 0) {
    const error = new Error(`Workspace fields missing: ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
}

async function runGit(args, cwd) {
  const { stdout, stderr } = await execFileAsync('git', args, { cwd });
  return { stdout, stderr };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Request body too large'));
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', reject);
  });
}

async function handleApi(req, res) {
  if (req.method === 'GET' && req.url === '/api/config') {
    const config = await readConfig();
    sendJson(res, 200, config);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/config') {
    const body = await parseBody(req);
    if (!body || !Array.isArray(body.workspaces)) {
      sendJson(res, 400, { error: 'workspaces must be an array' });
      return;
    }

    body.workspaces.forEach(validateWorkspace);
    await writeConfig(body);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/workspaces/create') {
    const { workspaceId, featureBranch } = await parseBody(req);
    if (!workspaceId || !featureBranch) {
      sendJson(res, 400, { error: 'workspaceId and featureBranch are required' });
      return;
    }

    const config = await readConfig();
    const workspace = config.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      sendJson(res, 404, { error: `Workspace ${workspaceId} not found` });
      return;
    }

    const workspaceRoot = path.join(expandHome(workspace.workspaceRoot), featureBranch);
    await fsp.mkdir(workspaceRoot, { recursive: true });

    const logs = [];
    for (const repo of workspace.repos) {
      const baseRepoPath = path.join(expandHome(workspace.baseRoot), repo.basePath || repo.name);
      const targetPath = path.join(workspaceRoot, repo.targetName || repo.name);

      try {
        await fsp.access(baseRepoPath, fs.constants.F_OK);
      } catch {
        sendJson(res, 400, { error: `Base repo not found: ${baseRepoPath}` });
        return;
      }

      await runGit(['worktree', 'add', '-b', featureBranch, targetPath], baseRepoPath);
      logs.push(`Added ${repo.name} => ${targetPath}`);
    }

    sendJson(res, 200, { ok: true, workspaceRoot, logs });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/workspaces/cleanup') {
    const { workspaceId, featureBranch } = await parseBody(req);
    if (!workspaceId || !featureBranch) {
      sendJson(res, 400, { error: 'workspaceId and featureBranch are required' });
      return;
    }

    const config = await readConfig();
    const workspace = config.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      sendJson(res, 404, { error: `Workspace ${workspaceId} not found` });
      return;
    }

    const workspaceRoot = path.join(expandHome(workspace.workspaceRoot), featureBranch);
    await fsp.rm(workspaceRoot, { recursive: true, force: true });

    const logs = [];
    for (const repo of workspace.repos) {
      const baseRepoPath = path.join(expandHome(workspace.baseRoot), repo.basePath || repo.name);
      await runGit(['worktree', 'prune'], baseRepoPath);
      logs.push(`Pruned ${repo.name}`);
    }

    sendJson(res, 200, { ok: true, workspaceRoot, logs });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function handleStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(urlPath).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const data = await fsp.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      await handleApi(req, res);
      return;
    }

    await handleStatic(req, res);
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || 'Internal server error',
      details: error.stderr || undefined,
    });
  }
});

server.listen(port, () => {
  console.log(`AI Workspace Manager running at http://localhost:${port}`);
});
