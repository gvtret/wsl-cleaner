import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const wslOps = require('../lib/wsl-ops');

describe('wslconfig INI sections (WSL 2.9+ experimental keys)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wslcfg-'));
    vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes experimental keys under [experimental], not [wsl2]', () => {
    const result = wslOps.writeWslConfig({
      wsl2: { memory: '8GB', networkingMode: 'mirrored' },
      experimental: { sparseVhd: 'true', autoMemoryReclaim: 'gradual' },
    });
    expect(result.ok).toBe(true);
    const raw = fs.readFileSync(path.join(tmpDir, '.wslconfig'), 'utf8');
    expect(raw).toContain('[wsl2]');
    expect(raw).toContain('[experimental]');
    expect(raw).toContain('sparseVhd=true');
    const beforeExperimental = raw.split('[experimental]')[0];
    expect(beforeExperimental).not.toContain('sparseVhd');
    expect(beforeExperimental).not.toContain('autoMemoryReclaim');
  });

  it('reads legacy experimental keys stored under [wsl2] without error', () => {
    fs.writeFileSync(path.join(tmpDir, '.wslconfig'), [
      '[wsl2]',
      'memory=4GB',
      'sparseVhd=true',
      'autoMemoryReclaim=gradual',
      '',
    ].join('\n'));
    const result = wslOps.readWslConfig();
    expect(result.ok).toBe(true);
    expect(result.data.wsl2.memory).toBe('4GB');
    expect(result.data.wsl2.sparseVhd).toBe('true');
    expect(result.data.wsl2.autoMemoryReclaim).toBe('gradual');
  });

  it('round-trips a correct [experimental] section', () => {
    fs.writeFileSync(path.join(tmpDir, '.wslconfig'), [
      '[wsl2]',
      'memory=4GB',
      '',
      '[experimental]',
      'sparseVhd=true',
      '',
    ].join('\n'));
    const read = wslOps.readWslConfig();
    expect(read.ok).toBe(true);
    expect(read.data.experimental.sparseVhd).toBe('true');

    const write = wslOps.writeWslConfig(read.data);
    expect(write.ok).toBe(true);
    const raw = fs.readFileSync(path.join(tmpDir, '.wslconfig'), 'utf8');
    expect(raw).toContain('[experimental]');
    expect(raw).toContain('sparseVhd=true');
  });
});
