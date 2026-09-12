const fs = require('fs');
const os = require('os');

const electronUpdaterPath = require.resolve('electron-updater');

function installElectronUpdaterMock() {
  const fakeAutoUpdater = {
    on: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  };
  require.cache[electronUpdaterPath] = {
    id: electronUpdaterPath,
    filename: electronUpdaterPath,
    loaded: true,
    exports: { autoUpdater: fakeAutoUpdater },
  };
}

const { installElectronMock } = require('../test-utils/electronMock');
const { installSpawnMock } = require('../test-utils/spawnMock');
const { installTreeKillMock } = require('../test-utils/treeKillMock');

function createFakeNotificationClass() {
  const createdInstances = [];
  function FakeNotification(options) {
    this.options = options;
    this.on = vi.fn();
    this.show = vi.fn();
    createdInstances.push(this);
  }
  FakeNotification.isSupported = vi.fn().mockReturnValue(true);
  FakeNotification.createdInstances = createdInstances;
  return FakeNotification;
}

function createElectronAppMock() {
  return {
    requestSingleInstanceLock: vi.fn().mockReturnValue(true),
    setName: vi.fn(),
    whenReady: vi.fn().mockReturnValue(new Promise(() => {})),
    on: vi.fn(),
    quit: vi.fn(),
    relaunch: vi.fn(),
    getVersion: vi.fn().mockReturnValue('0.8.0-beta'),
    isPackaged: false,
    name: 'Ambrosia',
  };
}

function collectHandlersByChannel(ipcMainMock) {
  const handlersByChannel = {};
  ipcMainMock.handle.mock.calls.forEach(([channel, handler]) => {
    handlersByChannel[channel] = handler;
  });
  return handlersByChannel;
}

function collectListenersByChannel(ipcMainMock) {
  const listenersByChannel = {};
  ipcMainMock.on.mock.calls.forEach(([channel, listener]) => {
    listenersByChannel[channel] = listener;
  });
  return listenersByChannel;
}

describe('IPC handlers and notifications', () => {
  const appMock = createElectronAppMock();
  const NotificationMock = createFakeNotificationClass();
  const ipcMainMock = { handle: vi.fn(), on: vi.fn() };
  let ipcHandlersByChannel;
  let ipcListenersByChannel;

  beforeAll(() => {
    installSpawnMock();
    installTreeKillMock();
    installElectronUpdaterMock();
    installElectronMock({
      app: appMock,
      BrowserWindow: vi.fn(),
      Menu: { buildFromTemplate: vi.fn().mockReturnValue({ items: [] }), setApplicationMenu: vi.fn() },
      Notification: NotificationMock,
      dialog: { showMessageBox: vi.fn(), showErrorBox: vi.fn() },
      shell: { openPath: vi.fn(), openExternal: vi.fn() },
      ipcMain: ipcMainMock,
    });
    require('../main');
    ipcHandlersByChannel = collectHandlersByChannel(ipcMainMock);
    ipcListenersByChannel = collectListenersByChannel(ipcMainMock);
  });

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue('/fake/home');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('');
    NotificationMock.isSupported.mockReturnValue(true);
    NotificationMock.createdInstances.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('services:get-statuses', () => {
    it('returns null before the service manager has been created', () => {
      expect(ipcHandlersByChannel['services:get-statuses']()).toBe(null);
    });
  });

  describe('services:restart', () => {
    it('rejects before the service manager has been created', async () => {
      await expect(ipcHandlersByChannel['services:restart']({}, 'backend'))
        .rejects.toThrow('ServiceManager not initialized');
    });
  });

  describe('services:get-logs', () => {
    it('returns the logs directory', () => {
      expect(ipcHandlersByChannel['services:get-logs']()).toEqual({
        logsDir: '/fake/home/.Ambrosia-POS/logs',
      });
    });
  });

  describe('app:relaunch', () => {
    it('relaunches and quits the app', () => {
      ipcHandlersByChannel['app:relaunch']();

      expect(appMock.relaunch).toHaveBeenCalled();
      expect(appMock.quit).toHaveBeenCalled();
    });
  });

  describe('phoenixd:get-auto-liquidity', () => {
    it('returns "off" when no phoenix.conf exists yet', () => {
      expect(ipcHandlersByChannel['phoenixd:get-auto-liquidity']()).toBe('off');
    });

    it('returns the configured value from phoenix.conf', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('auto-liquidity=medium\n');

      expect(ipcHandlersByChannel['phoenixd:get-auto-liquidity']()).toBe('medium');
    });
  });

  describe('phoenixd:set-auto-liquidity', () => {
    it('rejects before the service manager has been created', async () => {
      await expect(ipcHandlersByChannel['phoenixd:set-auto-liquidity']({}, 'medium'))
        .rejects.toThrow('ServiceManager not initialized');
    });
  });

  describe('notifications:admin-activity', () => {
    it('does not construct a notification when notifications are unsupported', () => {
      NotificationMock.isSupported.mockReturnValue(false);

      ipcListenersByChannel['notifications:admin-activity']({}, { title: 'New order' });

      expect(NotificationMock.createdInstances).toHaveLength(0);
    });

    it('normalizes the title with a fallback and shows the notification', () => {
      ipcListenersByChannel['notifications:admin-activity']({}, { body: 'Order #42 ready' });

      const [notification] = NotificationMock.createdInstances;
      expect(notification.options).toEqual({ title: 'Ambrosia', body: 'Order #42 ready', silent: false });
      expect(notification.show).toHaveBeenCalled();
    });

    it('falls back through title, fallbackActivityTitle, and systemBody for the body', () => {
      ipcListenersByChannel['notifications:admin-activity']({}, { fallbackActivityTitle: 'Fallback activity' });

      const [notification] = NotificationMock.createdInstances;
      expect(notification.options.body).toBe('Fallback activity');
    });

    it('truncates a title longer than 160 characters', () => {
      ipcListenersByChannel['notifications:admin-activity']({}, { systemTitle: 'x'.repeat(200) });

      const [notification] = NotificationMock.createdInstances;
      expect(notification.options.title).toHaveLength(160);
    });
  });
});

describe('single-instance lock', () => {
  async function loadFreshMainWithLock(lockAcquired) {
    const appMock = createElectronAppMock();
    appMock.requestSingleInstanceLock.mockReturnValue(lockAcquired);
    const ipcMainMock = { handle: vi.fn(), on: vi.fn() };

    vi.resetModules();
    installSpawnMock();
    installTreeKillMock();
    installElectronUpdaterMock();
    installElectronMock({
      app: appMock,
      BrowserWindow: vi.fn(),
      Menu: { buildFromTemplate: vi.fn().mockReturnValue({ items: [] }), setApplicationMenu: vi.fn() },
      Notification: createFakeNotificationClass(),
      dialog: { showMessageBox: vi.fn(), showErrorBox: vi.fn() },
      shell: { openPath: vi.fn(), openExternal: vi.fn() },
      ipcMain: ipcMainMock,
    });
    vi.spyOn(os, 'homedir').mockReturnValue('/fake/home');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    await import('../main');

    return appMock;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('quits immediately when another instance already holds the lock', async () => {
    const appMock = await loadFreshMainWithLock(false);

    expect(appMock.quit).toHaveBeenCalled();
  });

  it('registers a second-instance listener when this is the only instance', async () => {
    const appMock = await loadFreshMainWithLock(true);

    expect(appMock.on).toHaveBeenCalledWith('second-instance', expect.any(Function));
  });
});
