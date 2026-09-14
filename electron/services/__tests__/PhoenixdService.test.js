const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const { installElectronMock } = require('../../test-utils/electronMock');
const { createFakeSpawnedProcess, createFakeWriteStream } = require('../../test-utils/fakeChildProcess');
const { setPlatformAndArch, restorePlatformAndArch } = require('../../test-utils/platformMock');
const { installSpawnMock } = require('../../test-utils/spawnMock');
const { installTreeKillMock } = require('../../test-utils/treeKillMock');
const healthCheck = require('../../utils/healthCheck');
const logger = require('../../utils/logger');

let PhoenixdService;
let spawnMock;
let treeKillMock;

beforeAll(() => {
  installElectronMock();
  spawnMock = installSpawnMock();
  treeKillMock = installTreeKillMock();
  healthCheck.checkPhoenixd = vi.fn();
  childProcess.exec = vi.fn();
  PhoenixdService = require('../PhoenixdService');
});

function armAutoExitOnListen(spawnedProcess, exitCode = 0) {
  spawnedProcess.on('newListener', function autoExitWhenExitIsAwaited(eventName) {
    if (eventName !== 'exit') return;
    spawnedProcess.removeListener('newListener', autoExitWhenExitIsAwaited);
    process.nextTick(() => spawnedProcess.emit('exit', exitCode));
  });
}

let fakeSpawnedProcess;

beforeEach(() => {
  fakeSpawnedProcess = createFakeSpawnedProcess();
  spawnMock.mockReset().mockReturnValue(fakeSpawnedProcess);
  treeKillMock.mockReset().mockImplementation((_pid, _signal, callback) => callback());
  healthCheck.checkPhoenixd.mockReset().mockResolvedValue(true);
  childProcess.exec.mockReset().mockImplementation((_command, callback) => callback());
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
  vi.spyOn(fs, 'createWriteStream').mockImplementation(createFakeWriteStream);
  vi.spyOn(logger, 'log').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  restorePlatformAndArch();
  vi.restoreAllMocks();
});

describe('constructor', () => {
  it('starts with no process, stopped status, and no port', () => {
    const phoenixdService = new PhoenixdService();

    expect(phoenixdService.getStatus()).toBe('stopped');
    expect(phoenixdService.getPort()).toBe(null);
  });
});

describe('start', () => {
  it('throws when a process is already running', async () => {
    const phoenixdService = new PhoenixdService();
    await phoenixdService.start(9740);

    await expect(phoenixdService.start(9740)).rejects.toThrow('Phoenixd service is already running');
  });

  it('creates the data and logs directories when they do not exist', async () => {
    fs.existsSync.mockReturnValue(false);
    const phoenixdService = new PhoenixdService();

    await phoenixdService.start(9740);

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.phoenix'), { recursive: true });
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('logs'), { recursive: true });
  });

  it('does not create directories that already exist', async () => {
    fs.existsSync.mockReturnValue(true);
    const phoenixdService = new PhoenixdService();

    await phoenixdService.start(9740);

    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('spawns phoenixd with the port and terms-of-service args', async () => {
    const phoenixdService = new PhoenixdService();

    await phoenixdService.start(9740);

    expect(spawnMock).toHaveBeenCalledWith(
      'phoenixd',
      ['--agree-to-terms-of-service', '--http-bind-ip=127.0.0.1', '--http-bind-port=9740'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'], detached: false }),
    );
  });

  it('does not override JAVA_HOME on non-Windows platforms', async () => {
    setPlatformAndArch('darwin', 'arm64');
    const phoenixdService = new PhoenixdService();

    await phoenixdService.start(9740);

    const [, , spawnOptions] = spawnMock.mock.calls[0];
    expect(spawnOptions.env.JAVA_HOME).toBe(process.env.JAVA_HOME);
  });

  it('points JAVA_HOME at the bundled x64 JRE on Windows', async () => {
    setPlatformAndArch('win32', 'x64');
    const phoenixdService = new PhoenixdService();

    await phoenixdService.start(9740);

    const [, , spawnOptions] = spawnMock.mock.calls[0];
    expect(spawnOptions.env.JAVA_HOME).toBe(path.join(__dirname, '..', '..', 'jre', 'win-x64'));
  });

  it('waits for phoenixd to become healthy before resolving', async () => {
    const phoenixdService = new PhoenixdService();

    const result = await phoenixdService.start(9740);

    expect(healthCheck.checkPhoenixd).toHaveBeenCalledWith(9740);
    expect(result).toEqual({ port: 9740 });
    expect(phoenixdService.getStatus()).toBe('running');
  });

  it('stops the process and rethrows when the health check never succeeds', async () => {
    healthCheck.checkPhoenixd.mockRejectedValue(new Error('Timed out waiting for: http://localhost:9740/getinfo'));
    armAutoExitOnListen(fakeSpawnedProcess);
    const phoenixdService = new PhoenixdService();

    const startPromise = phoenixdService.start(9740);

    await expect(startPromise).rejects.toThrow('Timed out waiting for: http://localhost:9740/getinfo');
    expect(phoenixdService.getStatus()).toBe('stopped');
  });
});

describe('stop', () => {
  it('does nothing when there is no owned process and no known port', async () => {
    const phoenixdService = new PhoenixdService();

    await phoenixdService.stop();

    expect(treeKillMock).not.toHaveBeenCalled();
    expect(childProcess.exec).not.toHaveBeenCalled();
  });

  it('kills by port when there is a known port but no owned process', async () => {
    const phoenixdService = new PhoenixdService();
    phoenixdService.port = 9740;

    await phoenixdService.stop();

    expect(childProcess.exec).toHaveBeenCalledWith(expect.stringContaining('9740'), expect.any(Function));
  });

  it('resolves once the process exits cleanly after SIGTERM', async () => {
    armAutoExitOnListen(fakeSpawnedProcess);
    const phoenixdService = new PhoenixdService();
    await phoenixdService.start(9740);

    await phoenixdService.stop();

    expect(treeKillMock).toHaveBeenCalledWith(fakeSpawnedProcess.pid, 'SIGTERM', expect.any(Function));
    expect(phoenixdService.getStatus()).toBe('stopped');
  });

  it('falls back to SIGKILL when sending SIGTERM fails', async () => {
    treeKillMock.mockImplementation((_pid, signal, callback) => {
      if (signal === 'SIGTERM') callback(new Error('no such process'));
      else callback();
    });
    const phoenixdService = new PhoenixdService();
    await phoenixdService.start(9740);

    await phoenixdService.stop();

    expect(treeKillMock).toHaveBeenCalledWith(fakeSpawnedProcess.pid, 'SIGKILL', expect.any(Function));
  });

  it('force-kills with SIGKILL when the process does not exit before the timeout', async () => {
    vi.useFakeTimers();
    const phoenixdService = new PhoenixdService();
    await phoenixdService.start(9740);

    const stopPromise = phoenixdService.stop();
    await vi.advanceTimersByTimeAsync(5000);
    await stopPromise;

    expect(treeKillMock).toHaveBeenCalledWith(fakeSpawnedProcess.pid, 'SIGKILL', expect.any(Function));
    vi.useRealTimers();
  });
});

describe('killByPort', () => {
  it('does nothing when no port is given and none is tracked', async () => {
    const phoenixdService = new PhoenixdService();

    await phoenixdService.killByPort();

    expect(childProcess.exec).not.toHaveBeenCalled();
  });

  it('does nothing when the port is not an integer', async () => {
    const phoenixdService = new PhoenixdService();

    await phoenixdService.killByPort(NaN);

    expect(childProcess.exec).not.toHaveBeenCalled();
  });

  it('uses a taskkill command on Windows', async () => {
    setPlatformAndArch('win32', 'x64');
    const phoenixdService = new PhoenixdService();

    await phoenixdService.killByPort(9740);

    expect(childProcess.exec).toHaveBeenCalledWith(expect.stringContaining('taskkill'), expect.any(Function));
  });

  it('uses an lsof/kill command outside Windows', async () => {
    setPlatformAndArch('darwin', 'arm64');
    const phoenixdService = new PhoenixdService();

    await phoenixdService.killByPort(9740);

    expect(childProcess.exec).toHaveBeenCalledWith(expect.stringContaining('lsof'), expect.any(Function));
  });
});

describe('cleanup', () => {
  it('resets process, status, and closes the log stream', async () => {
    const phoenixdService = new PhoenixdService();
    await phoenixdService.start(9740);
    const logStreamEndSpy = phoenixdService.logStream.end;

    phoenixdService.cleanup();

    expect(phoenixdService.getStatus()).toBe('stopped');
    expect(logStreamEndSpy).toHaveBeenCalled();
  });
});
