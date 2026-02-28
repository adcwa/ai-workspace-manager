const els = {
  workspaceSelect: document.getElementById('workspaceSelect'),
  newWorkspaceBtn: document.getElementById('newWorkspaceBtn'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  deleteConfigBtn: document.getElementById('deleteConfigBtn'),
  workspaceId: document.getElementById('workspaceId'),
  workspaceName: document.getElementById('workspaceName'),
  baseRoot: document.getElementById('baseRoot'),
  workspaceRoot: document.getElementById('workspaceRoot'),
  repos: document.getElementById('repos'),
  featureBranch: document.getElementById('featureBranch'),
  createBtn: document.getElementById('createBtn'),
  cleanupBtn: document.getElementById('cleanupBtn'),
  log: document.getElementById('log'),
};

let configState = {
  activeWorkspace: '',
  workspaces: [],
};

function writeLog(message, append = true) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  els.log.textContent = append ? `${els.log.textContent}${line}\n` : `${line}\n`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function getWorkspaceById(id) {
  return configState.workspaces.find((workspace) => workspace.id === id);
}

function renderWorkspaceOptions() {
  els.workspaceSelect.innerHTML = '';
  for (const workspace of configState.workspaces) {
    const option = document.createElement('option');
    option.value = workspace.id;
    option.textContent = `${workspace.name} (${workspace.id})`;
    els.workspaceSelect.appendChild(option);
  }

  if (configState.activeWorkspace && getWorkspaceById(configState.activeWorkspace)) {
    els.workspaceSelect.value = configState.activeWorkspace;
  } else if (configState.workspaces.length > 0) {
    configState.activeWorkspace = configState.workspaces[0].id;
    els.workspaceSelect.value = configState.activeWorkspace;
  }

  loadWorkspaceToForm(configState.activeWorkspace);
}

function loadWorkspaceToForm(workspaceId) {
  const workspace = getWorkspaceById(workspaceId);
  if (!workspace) {
    els.workspaceId.value = '';
    els.workspaceName.value = '';
    els.baseRoot.value = '~/git-base';
    els.workspaceRoot.value = '~/workspace';
    els.repos.value = '[\n  {"name": "repo-a"},\n  {"name": "repo-b"}\n]';
    return;
  }

  els.workspaceId.value = workspace.id;
  els.workspaceName.value = workspace.name;
  els.baseRoot.value = workspace.baseRoot;
  els.workspaceRoot.value = workspace.workspaceRoot;
  els.repos.value = JSON.stringify(workspace.repos, null, 2);
}

function readFormWorkspace() {
  const repos = JSON.parse(els.repos.value || '[]');
  if (!Array.isArray(repos) || repos.length === 0) {
    throw new Error('repos 必须是非空 JSON 数组');
  }

  return {
    id: els.workspaceId.value.trim(),
    name: els.workspaceName.value.trim(),
    baseRoot: els.baseRoot.value.trim(),
    workspaceRoot: els.workspaceRoot.value.trim(),
    repos,
  };
}

async function loadConfig() {
  configState = await api('/api/config');
  renderWorkspaceOptions();
  writeLog('配置已加载', false);
}

async function saveConfig() {
  const workspace = readFormWorkspace();
  if (!workspace.id) {
    throw new Error('ID 不能为空');
  }

  const index = configState.workspaces.findIndex((item) => item.id === workspace.id);
  if (index >= 0) {
    configState.workspaces[index] = workspace;
  } else {
    configState.workspaces.push(workspace);
  }

  configState.activeWorkspace = workspace.id;
  await api('/api/config', {
    method: 'POST',
    body: JSON.stringify(configState),
  });

  renderWorkspaceOptions();
  writeLog(`配置 ${workspace.id} 已保存`);
}

async function deleteConfig() {
  const currentId = configState.activeWorkspace;
  if (!currentId) {
    return;
  }

  configState.workspaces = configState.workspaces.filter((item) => item.id !== currentId);
  configState.activeWorkspace = configState.workspaces[0]?.id || '';

  await api('/api/config', {
    method: 'POST',
    body: JSON.stringify(configState),
  });

  renderWorkspaceOptions();
  writeLog(`配置 ${currentId} 已删除`);
}

async function createWorkspace() {
  const featureBranch = els.featureBranch.value.trim();
  if (!featureBranch) {
    throw new Error('Feature 分支不能为空');
  }

  const data = await api('/api/workspaces/create', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId: configState.activeWorkspace,
      featureBranch,
    }),
  });

  writeLog(`创建成功: ${data.workspaceRoot}`);
  for (const line of data.logs) {
    writeLog(`  - ${line}`);
  }
}

async function cleanupWorkspace() {
  const featureBranch = els.featureBranch.value.trim();
  if (!featureBranch) {
    throw new Error('Feature 分支不能为空');
  }

  const data = await api('/api/workspaces/cleanup', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId: configState.activeWorkspace,
      featureBranch,
    }),
  });

  writeLog(`清理成功: ${data.workspaceRoot}`);
  for (const line of data.logs) {
    writeLog(`  - ${line}`);
  }
}

els.workspaceSelect.addEventListener('change', (event) => {
  configState.activeWorkspace = event.target.value;
  loadWorkspaceToForm(configState.activeWorkspace);
});

els.newWorkspaceBtn.addEventListener('click', () => {
  configState.activeWorkspace = '';
  loadWorkspaceToForm('');
  writeLog('已切换到新建模式');
});

els.saveConfigBtn.addEventListener('click', async () => {
  try {
    await saveConfig();
  } catch (error) {
    writeLog(`保存失败: ${error.message}`);
  }
});

els.deleteConfigBtn.addEventListener('click', async () => {
  try {
    await deleteConfig();
  } catch (error) {
    writeLog(`删除失败: ${error.message}`);
  }
});

els.createBtn.addEventListener('click', async () => {
  try {
    await createWorkspace();
  } catch (error) {
    writeLog(`创建失败: ${error.message}`);
  }
});

els.cleanupBtn.addEventListener('click', async () => {
  try {
    await cleanupWorkspace();
  } catch (error) {
    writeLog(`清理失败: ${error.message}`);
  }
});

loadConfig().catch((error) => {
  writeLog(`初始化失败: ${error.message}`, false);
});
