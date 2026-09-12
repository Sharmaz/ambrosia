const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { installElectronMock } = require('../../test-utils/electronMock');

let configurationBootstrap;

beforeAll(() => {
  installElectronMock();
  configurationBootstrap = require('../ConfigurationBootstrap');
});

const FAKE_HOME_DIRECTORY = '/fake/home';
const AMBROSIA_CONFIG_PATH = path.join(FAKE_HOME_DIRECTORY, '.Ambrosia-POS', 'ambrosia.conf');
const PHOENIX_CONFIG_PATH = path.join(FAKE_HOME_DIRECTORY, '.phoenix', 'phoenix.conf');

let fakeFiles;

function installFakeFileSystem() {
  fakeFiles = new Map();
  vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => fakeFiles.has(filePath));
  vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
  vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, content) => {
    fakeFiles.set(filePath, content);
  });
  vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => fakeFiles.get(filePath));
}

beforeEach(() => {
  vi.spyOn(os, 'homedir').mockReturnValue(FAKE_HOME_DIRECTORY);
  installFakeFileSystem();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateRandomHex', () => {
  it('returns a hex string with two characters per byte', () => {
    expect(configurationBootstrap.generateRandomHex(32)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a different value on each call', () => {
    const firstHex = configurationBootstrap.generateRandomHex(32);
    const secondHex = configurationBootstrap.generateRandomHex(32);

    expect(firstHex).not.toBe(secondHex);
  });
});

describe('readConfig', () => {
  it('returns an empty object when the file does not exist', () => {
    expect(configurationBootstrap.readConfig('/does/not/exist.conf')).toEqual({});
  });

  it('parses key=value lines into an object', () => {
    fakeFiles.set('/config.conf', 'http-bind-ip=127.0.0.1\nhttp-bind-port=9154\n');

    expect(configurationBootstrap.readConfig('/config.conf')).toEqual({
      'http-bind-ip': '127.0.0.1',
      'http-bind-port': '9154',
    });
  });

  it('skips blank lines and comment lines', () => {
    fakeFiles.set('/config.conf', '# a comment\n\nhttp-bind-ip=127.0.0.1\n');

    expect(configurationBootstrap.readConfig('/config.conf')).toEqual({ 'http-bind-ip': '127.0.0.1' });
  });

  it('preserves "=" characters inside the value', () => {
    fakeFiles.set('/config.conf', 'webhook=http://localhost:9154/webhook?token=abc=def\n');

    expect(configurationBootstrap.readConfig('/config.conf')).toEqual({
      webhook: 'http://localhost:9154/webhook?token=abc=def',
    });
  });

  it('trims whitespace around keys and values', () => {
    fakeFiles.set('/config.conf', '  http-bind-ip = 127.0.0.1  \n');

    expect(configurationBootstrap.readConfig('/config.conf')).toEqual({ 'http-bind-ip': '127.0.0.1' });
  });
});

describe('writeConfig', () => {
  it('writes key=value lines with a trailing newline', () => {
    configurationBootstrap.writeConfig('/config.conf', { a: '1', b: '2' });

    expect(fakeFiles.get('/config.conf')).toBe('a=1\nb=2\n');
  });

  it('writes the file with owner-only permissions', () => {
    configurationBootstrap.writeConfig('/config.conf', { a: '1' });

    expect(fs.writeFileSync).toHaveBeenCalledWith('/config.conf', 'a=1\n', { encoding: 'utf-8', mode: 0o600 });
  });
});

describe('configExists', () => {
  it('returns false when neither config file exists', () => {
    expect(configurationBootstrap.configExists()).toBe(false);
  });

  it('returns false when only the ambrosia config exists', () => {
    fakeFiles.set(AMBROSIA_CONFIG_PATH, '');

    expect(configurationBootstrap.configExists()).toBe(false);
  });

  it('returns true when both config files exist', () => {
    fakeFiles.set(AMBROSIA_CONFIG_PATH, '');
    fakeFiles.set(PHOENIX_CONFIG_PATH, '');

    expect(configurationBootstrap.configExists()).toBe(true);
  });
});

describe('ensureConfigurations', () => {
  const allocatedPorts = { backend: 9154, phoenixd: 9740, nextjs: 3000 };

  it('creates the data, phoenix, and logs directories when they do not exist', async () => {
    await configurationBootstrap.ensureConfigurations(allocatedPorts);

    expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(FAKE_HOME_DIRECTORY, '.Ambrosia-POS'), { recursive: true });
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(FAKE_HOME_DIRECTORY, '.phoenix'), { recursive: true });
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(FAKE_HOME_DIRECTORY, '.Ambrosia-POS', 'logs'), { recursive: true });
  });

  it('generates a new ambrosia config with a secret and a matching secret-hash', async () => {
    const { ambrosia } = await configurationBootstrap.ensureConfigurations(allocatedPorts);

    expect(ambrosia.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(ambrosia['secret-hash']).toBe(crypto.createHash('sha256').update(ambrosia.secret).digest('hex'));
    expect(ambrosia['http-bind-port']).toBe('9154');
    expect(ambrosia['phoenixd-url']).toBe('http://localhost:9740');
  });

  it('generates a new phoenix config with independent random secrets', async () => {
    const { phoenix } = await configurationBootstrap.ensureConfigurations(allocatedPorts);

    expect(phoenix['http-password']).toMatch(/^[0-9a-f]{64}$/);
    expect(phoenix['http-password-limited-access']).toMatch(/^[0-9a-f]{64}$/);
    expect(phoenix['webhook-secret']).toMatch(/^[0-9a-f]{64}$/);
    expect(phoenix['http-password']).not.toBe(phoenix['http-password-limited-access']);
    expect(phoenix.webhook).toBe('http://127.0.0.1:9154/webhook/phoenixd');
  });

  it('does not regenerate the ambrosia secret when the config already exists', async () => {
    fakeFiles.set(AMBROSIA_CONFIG_PATH, 'secret=existing-secret\nsecret-hash=existing-hash\nhttp-bind-port=1111\n');
    fakeFiles.set(PHOENIX_CONFIG_PATH, 'http-password=existing-password\n');

    const { ambrosia } = await configurationBootstrap.ensureConfigurations(allocatedPorts);

    expect(ambrosia.secret).toBe('existing-secret');
    expect(ambrosia['secret-hash']).toBe('existing-hash');
    expect(ambrosia['http-bind-port']).toBe('9154');
  });

  it('does not overwrite phoenixd-url when a remote phoenixd node is already configured', async () => {
    fakeFiles.set(
      AMBROSIA_CONFIG_PATH,
      'secret=existing-secret\nsecret-hash=existing-hash\nphoenixd-remote=true\nphoenixd-url=http://100.1.1.1:9740\n',
    );
    fakeFiles.set(PHOENIX_CONFIG_PATH, 'http-password=existing-password\n');

    const { ambrosia } = await configurationBootstrap.ensureConfigurations(allocatedPorts);

    expect(ambrosia['phoenixd-url']).toBe('http://100.1.1.1:9740');
  });

  it('does not regenerate phoenix secrets when the config already exists', async () => {
    fakeFiles.set(AMBROSIA_CONFIG_PATH, 'secret=existing-secret\nsecret-hash=existing-hash\n');
    fakeFiles.set(PHOENIX_CONFIG_PATH, 'http-password=existing-password\nwebhook-secret=existing-webhook-secret\n');

    const { phoenix } = await configurationBootstrap.ensureConfigurations(allocatedPorts);

    expect(phoenix['http-password']).toBe('existing-password');
    expect(phoenix['webhook-secret']).toBe('existing-webhook-secret');
    expect(phoenix.webhook).toBe('http://127.0.0.1:9154/webhook/phoenixd');
  });

  it('persists both config files to disk when a new config was generated', async () => {
    await configurationBootstrap.ensureConfigurations(allocatedPorts);

    expect(fakeFiles.has(AMBROSIA_CONFIG_PATH)).toBe(true);
    expect(fakeFiles.has(PHOENIX_CONFIG_PATH)).toBe(true);
  });
});
