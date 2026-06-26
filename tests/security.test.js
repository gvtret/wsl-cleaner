import { describe, it, expect, beforeEach } from 'vitest';

// wsl-ops destructures child_process bindings at load time, so we patch the
// cached module *before* requiring it. (vi.mock does not intercept CommonJS
// `require`, so we record calls by hand.) Each vitest file has an isolated
// module registry, so this patch does not leak to other suites.
const cp = require('child_process');

const calls = { execFileSync: [], execSync: [], spawn: [] };

cp.execFileSync = (...args) => { calls.execFileSync.push(args); return ''; };
cp.execSync = (...args) => { calls.execSync.push(args); return ''; };
cp.spawn = (...args) => {
  calls.spawn.push(args);
  // A child stub that never emits 'close' — pending promises are abandoned.
  return { stdout: { on() {} }, stderr: { on() {} }, on() {} };
};

const wslOps = require('../lib/wsl-ops');

beforeEach(() => {
  calls.execFileSync.length = 0;
  calls.execSync.length = 0;
  calls.spawn.length = 0;
});

// ── #1 Command injection via distro name (detectTools) ────────────────────────

describe('detectTools — distro name is never shell-interpolated', () => {
  const EVIL = 'Ubuntu" & calc & "';

  it('uses execFileSync with an args array, not execSync with a shell string', () => {
    wslOps.detectTools(EVIL);
    expect(calls.execSync).toHaveLength(0);
    expect(calls.execFileSync.length).toBeGreaterThan(0);
  });

  it('passes the distro name as a single discrete argument', () => {
    wslOps.detectTools(EVIL);
    const [file, args] = calls.execFileSync[0];
    expect(file).toBe('wsl');
    expect(args[0]).toBe('-d');
    // The raw distro name occupies exactly one argv slot — its metacharacters
    // can never reach a shell parser.
    expect(args[1]).toBe(EVIL);
    expect(args).toContain('bash');
    expect(args.filter(a => a === EVIL)).toHaveLength(1);
    // Nothing concatenated the name into a larger shell command string.
    expect(args.some(a => a !== EVIL && a.includes('calc'))).toBe(false);
  });
});

// ── #2 Path injection in disk scan (shellQuote) ───────────────────────────────

describe('shellQuote', () => {
  it('wraps a plain value in single quotes', () => {
    expect(wslOps.shellQuote('/var/log')).toBe(`'/var/log'`);
  });

  it('neutralises an embedded single-quote break-out attempt', () => {
    // A directory literally named to escape quoting and run `rm -rf /`.
    const evil = `/tmp/'; rm -rf / #`;
    const quoted = wslOps.shellQuote(evil);
    expect(quoted.startsWith(`'`)).toBe(true);
    expect(quoted.endsWith(`'`)).toBe(true);
    expect(quoted).toBe(`'/tmp/'\\''; rm -rf / #'`);
    // Embedded in a command, no bare unquoted `; rm` escapes the quotes.
    const cmd = `du ${quoted}`;
    expect(cmd).not.toMatch(/du '[^']*'; rm/);
  });

  it('handles backticks and $() without leaving them unquoted', () => {
    expect(wslOps.shellQuote('$(reboot)`id`')).toBe(`'$(reboot)\`id\`'`);
  });
});

// ── #3 Predictable temp-file names (uniqueTempPath) ───────────────────────────

describe('uniqueTempPath', () => {
  it('embeds the label and extension', () => {
    const p = wslOps.uniqueTempPath('health', 'sh');
    expect(p).toMatch(/wsl-cleaner-health-[0-9a-f]+\.sh$/);
  });

  it('produces a different path on every call', () => {
    expect(wslOps.uniqueTempPath('diskusage', 'sh'))
      .not.toBe(wslOps.uniqueTempPath('diskusage', 'sh'));
  });
});

// ── #5 runWslCommand executable allowlist ─────────────────────────────────────

describe('runWslCommand — only "wsl" is permitted', () => {
  it('rejects a non-wsl executable without spawning it', async () => {
    const res = await wslOps.runWslCommand({ command: 'calc.exe' });
    expect(res.ok).toBe(false);
    expect(res.code).toBe(-1);
    expect(calls.spawn).toHaveLength(0);
  });

  it('rejects a chained command that starts with another program', async () => {
    const res = await wslOps.runWslCommand({ command: 'notepad && wsl --shutdown' });
    expect(res.ok).toBe(false);
    expect(calls.spawn).toHaveLength(0);
  });

  it('rejects empty / missing command', async () => {
    expect((await wslOps.runWslCommand({ command: '' })).ok).toBe(false);
    expect((await wslOps.runWslCommand({})).ok).toBe(false);
    expect(calls.spawn).toHaveLength(0);
  });

  it('spawns wsl (only) for a valid wsl command', () => {
    // Promise stays pending (stub never closes); assert the synchronous spawn.
    wslOps.runWslCommand({ command: 'wsl --shutdown' });
    expect(calls.spawn).toHaveLength(1);
    const [file, args] = calls.spawn[0];
    expect(file).toBe('wsl');
    expect(args).toEqual(['--shutdown']);
  });
});
