import { describe, it, expect, beforeEach } from 'vitest';

// Patch child_process before wsl-ops loads. Use stable wrapper functions so
// wsl-ops keeps a working reference after we reconfigure mocks per test.
const cp = require('child_process');

const calls = { execFileSync: [], execSync: [], spawn: [] };

let execSyncImpl = () => {
  throw new Error('execSync not configured for this test');
};
let execFileSyncImpl = () => {
  throw new Error('execFileSync not configured for this test');
};

cp.execSync = (...args) => {
  calls.execSync.push(args);
  return execSyncImpl(...args);
};

cp.execFileSync = (...args) => {
  calls.execFileSync.push(args);
  return execFileSyncImpl(...args);
};

cp.spawn = (...args) => {
  calls.spawn.push(args);
  return { stdout: { on() {} }, stderr: { on() {} }, on() {} };
};

const wslOps = require('../lib/wsl-ops');

const WSL_LIST_OUTPUT = '  NAME      STATE           VERSION\n* Ubuntu    Running         2\n';

beforeEach(() => {
  calls.execFileSync.length = 0;
  calls.execSync.length = 0;
  calls.spawn.length = 0;
  execSyncImpl = () => {
    throw new Error('execSync not configured for this test');
  };
  execFileSyncImpl = () => {
    throw new Error('execFileSync not configured for this test');
  };
});

function mockWslListOnly() {
  execSyncImpl = (cmd) => {
    if (String(cmd).includes('-l -v')) return WSL_LIST_OUTPUT;
    if (String(cmd).includes('--version')) {
      throw new Error('Invalid command line option: --version');
    }
    throw new Error(`unexpected execSync: ${cmd}`);
  };
}

// ── Pre-WSL 2.9: no `wsl --version` ─────────────────────────────────────────

describe('checkWsl — older WSL without wsl --version', () => {
  it('still lists distros when --version is unsupported', () => {
    mockWslListOnly();
    const result = wslOps.checkWsl();
    expect(result.ok).toBe(true);
    expect(result.distros).toHaveLength(1);
    expect(result.defaultDistro).toBe('Ubuntu');
    expect(result.version).toBeNull();
  });
});

// ── Pre-WSL 2.9: no wslc CLI ─────────────────────────────────────────────────

describe('detectHostTools — WSL without wslc', () => {
  it('returns wslc: false when wslc is not on PATH', () => {
    execFileSyncImpl = (...args) => {
      if (args[0] === 'wslc') throw new Error('not recognized');
      return '';
    };
    expect(wslOps.detectHostTools()).toEqual({ wslc: false });
  });
});

describe('getWslHostInfo — WSL without wslc', () => {
  it('returns version when available but wslc stats are null', () => {
    execSyncImpl = (cmd) => {
      if (String(cmd).includes('--version')) {
        return 'WSL version: 2.2.4.0\nKernel version: 5.15.153.1-2\n';
      }
      throw new Error(`unexpected execSync: ${cmd}`);
    };
    execFileSyncImpl = (...args) => {
      if (args[0] === 'wslc') throw new Error('not found');
      return '';
    };
    expect(wslOps.getWslHostInfo()).toEqual({
      version: { wsl: '2.2.4.0', kernel: '5.15.153.1-2' },
      wslc: null,
    });
  });

  it('returns wslc stats from JSON list when wslc is available', () => {
    execSyncImpl = (cmd) => {
      if (String(cmd).includes('--version')) {
        return 'WSL version: 2.9.3.0\n';
      }
      throw new Error(`unexpected execSync: ${cmd}`);
    };
    execFileSyncImpl = (...args) => {
      if (args[0] === 'wslc' && args[1]?.[0] === '--version') return 'wslc 2.9.3.0\n';
      if (args[0] === 'wslc' && args[1]?.includes('json')) {
        return JSON.stringify([
          { Status: 'running 2 minutes ago' },
          { Status: 'exited' },
        ]);
      }
      throw new Error(`unexpected execFileSync: ${args[0]} ${args[1]?.join(' ')}`);
    };
    expect(wslOps.getWslHostInfo()).toEqual({
      version: { wsl: '2.9.3.0' },
      wslc: { running: 1, stopped: 1, total: 2 },
    });
  });

  it('shows zero counts when wslc list is empty', () => {
    execSyncImpl = (cmd) => {
      if (String(cmd).includes('--version')) return 'WSL version: 2.9.3.0\n';
      throw new Error(`unexpected execSync: ${cmd}`);
    };
    execFileSyncImpl = (...args) => {
      if (args[0] === 'wslc' && args[1]?.[0] === '--version') return 'wslc 2.9.3.0\n';
      if (args[0] === 'wslc') return '[]';
      throw new Error(`unexpected execFileSync: ${args[0]}`);
    };
    expect(wslOps.getWslHostInfo().wslc).toEqual({ running: 0, stopped: 0, total: 0 });
  });

  it('returns null version and null wslc on legacy installs', () => {
    mockWslListOnly();
    execFileSyncImpl = (...args) => {
      if (args[0] === 'wslc') throw new Error('not found');
      throw new Error(`unexpected execFileSync: ${args[0]}`);
    };
    expect(wslOps.getWslHostInfo()).toEqual({ version: null, wslc: null });
  });
});

describe('runHostCleanupTask — WSL without wslc', () => {
  it('skips gracefully (ok) without spawning when wslc is missing', async () => {
    execFileSyncImpl = (...args) => {
      if (args[0] === 'wslc') throw new Error('not found');
      return '';
    };
    const res = await wslOps.runHostCleanupTask({
      taskId: 'wslc-prune',
      command: 'image prune|container prune',
    });
    expect(res.ok).toBe(true);
    expect(res.output).toMatch(/skipping WSL Containers cleanup/i);
    expect(calls.spawn).toHaveLength(0);
  });
});

// ── Task availability on older WSL (no wslc) ─────────────────────────────────

describe('task gating without wslc', () => {
  const { TASKS } = require('../renderer/tasks');

  function availableTasks(tools) {
    return TASKS.filter(t => !t.requires || tools[t.requires]);
  }

  it('excludes wslc-prune but keeps docker-prune when only docker is present', () => {
    const tools = { docker: true, wslc: false };
    const ids = availableTasks(tools).map(t => t.id);
    expect(ids).not.toContain('wslc-prune');
    expect(ids).toContain('docker-prune');
  });

  it('includes wslc-prune only when wslc is detected on the host', () => {
    const tools = { wslc: true };
    const ids = availableTasks(tools).map(t => t.id);
    expect(ids).toContain('wslc-prune');
  });

  it('host tasks are not run inside WSL (host flag set)', () => {
    const wslcTask = TASKS.find(t => t.id === 'wslc-prune');
    expect(wslcTask.host).toBe(true);
    expect(wslcTask.requires).toBe('wslc');
  });
});
