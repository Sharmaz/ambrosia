const fs = require('fs');

const { installElectronMock } = require('../../test-utils/electronMock');
const { createFakeSpawnedProcess, createFakeWriteStream } = require('../../test-utils/fakeChildProcess');
const { installSpawnMock } = require('../../test-utils/spawnMock');
const { installTreeKillMock } = require('../../test-utils/treeKillMock');
const healthCheck = require('../../utils/healthCheck');
const logger = require('../../utils/logger');

let BackendService;
let spawnMock;
let treeKillMock;

beforeAll(() => {
  installElectronMock();
  spawnMock = installSpawnMock();
  treeKillMock = installTreeKillMock();
  healthCheck.checkBackend = vi.fn();
  BackendService = require('../BackendService');
});

let fakeSpawnedProcess;

const backendConfig = { phoenixdPort: 9740, phoenixPassword: 'phoenix-password', webhookSecret: 'webhook-secret' };

beforeEach(() => {
  fakeSpawnedProcess = createFakeSpawnedProcess();
  spawnMock.mockReset().mockReturnValue(fakeSpawnedProcess);
  treeKillMock.mockReset().mockImplementation((_pid, _signal, callback) => callback());
  healthCheck.checkBackend.mockReset().mockResolvedValue(true);
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
  vi.spyOn(fs, 'createWriteStream').mockImplementation(createFakeWriteStream);
  vi.spyOn(logger, 'log').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('constructor', () => {
  it('starts with no process, stopped status, and no port', () => {
    const backendService = new BackendService();

    expect(backendService.getStatus()).toBe('stopped');
    expect(backendService.getPort()).toBe(null);
  });
});

describe('start', () => {
  it('throws when a process is already running', async () => {
    const backendService = new BackendService();
    await backendService.start(9154, backendConfig);

    await expect(backendService.start(9154, backendConfig)).rejects.toThrow('Backend service is already running');
  });

  it('creates the logs directory when it does not exist', async () => {
    fs.existsSync.mockReturnValue(false);
    const backendService = new BackendService();

    await backendService.start(9154, backendConfig);

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('logs'), { recursive: true });
  });

  it('does not create the logs directory when it already exists', async () => {
    fs.existsSync.mockReturnValue(true);
    const backendService = new BackendService();

    await backendService.start(9154, backendConfig);

    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('spawns java with the jar path and port args', async () => {
    const backendService = new BackendService();

    await backendService.start(9154, backendConfig);

    const [javaPath, args] = spawnMock.mock.calls[0];
    expect(javaPath).toBe('java');
    expect(args).toEqual(expect.arrayContaining([
      '-jar',
      '--http-bind-ip=127.0.0.1',
      '--http-bind-port=9154',
      '--phoenixd-url=http://localhost:9740',
    ]));
  });

  it('omits the phoenixd-url arg when a remote phoenixd node is configured', async () => {
    const backendService = new BackendService();

    await backendService.start(9154, { ...backendConfig, phoenixdRemoteConfigured: true });

    const [, args] = spawnMock.mock.calls[0];
    expect(args).not.toEqual(expect.arrayContaining([expect.stringContaining('--phoenixd-url')]));
  });

  it('passes the phoenixd password and webhook secret as env vars', async () => {
    const backendService = new BackendService();

    await backendService.start(9154, backendConfig);

    const [, , spawnOptions] = spawnMock.mock.calls[0];
    expect(spawnOptions.env.PHOENIXD_PASSWORD).toBe('phoenix-password');
    expect(spawnOptions.env.PHOENIXD_WEBHOOK_SECRET).toBe('webhook-secret');
  });

  it('strips JAVA_* env vars before spawning', async () => {
    process.env.JAVA_TOOL_OPTIONS = '-Xmx512m';
    const backendService = new BackendService();

    await backendService.start(9154, backendConfig);

    const [, , spawnOptions] = spawnMock.mock.calls[0];
    expect(spawnOptions.env.JAVA_TOOL_OPTIONS).toBeUndefined();

    delete process.env.JAVA_TOOL_OPTIONS;
  });

  it('waits for the backend to become healthy before resolving', async () => {
    const backendService = new BackendService();

    const result = await backendService.start(9154, backendConfig);

    expect(healthCheck.checkBackend).toHaveBeenCalledWith(9154);
    expect(result).toEqual({ port: 9154 });
    expect(backendService.getStatus()).toBe('running');
  });

  it('stops the process and rethrows when the health check never succeeds', async () => {
    healthCheck.checkBackend.mockRejectedValue(new Error('Timed out waiting for: http://localhost:9154/api/health'));
    const backendService = new BackendService();

    await expect(backendService.start(9154, backendConfig))
      .rejects.toThrow('Timed out waiting for: http://localhost:9154/api/health');
    expect(backendService.getStatus()).toBe('stopped');
  });
});

describe('stop', () => {
  it('does nothing when there is no process to stop', async () => {
    const backendService = new BackendService();

    await backendService.stop();

    expect(treeKillMock).not.toHaveBeenCalled();
  });

  it('resolves once SIGTERM succeeds', async () => {
    const backendService = new BackendService();
    await backendService.start(9154, backendConfig);

    await backendService.stop();

    expect(treeKillMock).toHaveBeenCalledWith(fakeSpawnedProcess.pid, 'SIGTERM', expect.any(Function));
    expect(backendService.getStatus()).toBe('stopped');
  });

  it('falls back to SIGKILL when sending SIGTERM fails', async () => {
    treeKillMock.mockImplementation((_pid, signal, callback) => {
      if (signal === 'SIGTERM') callback(new Error('no such process'));
      else callback();
    });
    const backendService = new BackendService();
    await backendService.start(9154, backendConfig);

    await backendService.stop();

    expect(treeKillMock).toHaveBeenCalledWith(fakeSpawnedProcess.pid, 'SIGKILL', expect.any(Function));
  });

  it('force-kills with SIGKILL when SIGTERM never calls back before the timeout', async () => {
    vi.useFakeTimers();
    treeKillMock.mockImplementation((_pid, signal, callback) => {
      if (signal === 'SIGKILL') callback();
    });
    const backendService = new BackendService();
    await backendService.start(9154, backendConfig);

    const stopPromise = backendService.stop();
    await vi.advanceTimersByTimeAsync(10000);
    await stopPromise;

    expect(treeKillMock).toHaveBeenCalledWith(fakeSpawnedProcess.pid, 'SIGKILL', expect.any(Function));
    vi.useRealTimers();
  });
});

describe('cleanup', () => {
  it('resets process, status, and closes the log stream', async () => {
    const backendService = new BackendService();
    await backendService.start(9154, backendConfig);
    const logStreamEndSpy = backendService.logStream.end;

    backendService.cleanup();

    expect(backendService.getStatus()).toBe('stopped');
    expect(logStreamEndSpy).toHaveBeenCalled();
  });
});
