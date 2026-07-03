import { describe, it, expect } from 'vitest';

const { parseWslVersionOutput, parseWslcContainerListJson } = require('../lib/wsl-ops');

describe('parseWslVersionOutput', () => {
  it('parses English wsl --version output', () => {
    const text = [
      'WSL version: 2.9.3.0',
      'Kernel version: 6.18.35.2-1',
      'WSLg version: 1.0.79',
    ].join('\n');
    expect(parseWslVersionOutput(text)).toEqual({
      wsl: '2.9.3.0',
      kernel: '6.18.35.2-1',
    });
  });

  it('parses localized version lines when WSL label is present', () => {
    const text = 'Версия WSL: 2.9.3.0\nВерсия ядра: 6.18.35.2-1';
    expect(parseWslVersionOutput(text)).toEqual({
      wsl: '2.9.3.0',
      kernel: '6.18.35.2-1',
    });
  });

  it('parses Russian labels without ASCII Kernel prefix', () => {
    expect(parseWslVersionOutput('Версия WSL: 2.7.10.0\nВерсия ядра: 6.6.87.2-1')).toEqual({
      wsl: '2.7.10.0',
      kernel: '6.6.87.2-1',
    });
  });

  it('returns empty object for unrecognized text', () => {
    expect(parseWslVersionOutput('not version info')).toEqual({});
  });

  it('parses older store WSL versions (2.0.x, 2.7.x)', () => {
    expect(parseWslVersionOutput('WSL version: 2.0.14.0\nKernel version: 5.15.146.1-2\n')).toEqual({
      wsl: '2.0.14.0',
      kernel: '5.15.146.1-2',
    });
    expect(parseWslVersionOutput('WSL version: 2.7.10.0\nKernel version: 6.6.87.2-1\n')).toEqual({
      wsl: '2.7.10.0',
      kernel: '6.6.87.2-1',
    });
  });

  it('does not treat missing wsl --version output as a version', () => {
    expect(parseWslVersionOutput('')).toEqual({});
    expect(parseWslVersionOutput('Invalid command line option: --version')).toEqual({});
  });
});

describe('parseWslcContainerListJson', () => {
  it('parses wslc ps --format json output', () => {
    const json = JSON.stringify([
      { Status: 'running 1 minute ago' },
      { Status: 'exited' },
    ]);
    expect(parseWslcContainerListJson(json)).toEqual({
      running: 1,
      stopped: 1,
      total: 2,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(parseWslcContainerListJson('[]')).toEqual({
      running: 0,
      stopped: 0,
      total: 0,
    });
  });

  it('returns null for invalid JSON', () => {
    expect(parseWslcContainerListJson('not json')).toBeNull();
  });
});
