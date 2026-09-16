const { EventEmitter } = require('events');

const { HEALTH, STARTUP } = require('../utils/constants.js');
const { isPhoenixdRunning, isBackendRunning } = require('../utils/healthCheck.cjs');
const { logger } = require('../utils/logger.js');
const { allocatePorts, DEFAULT_PORTS } = require('../utils/portAllocator.cjs');
const { isDevelopment } = require('../utils/resourcePaths.cjs');

const BackendService = require('./BackendService.cjs');
const { ensureConfigurations } = require('./ConfigurationBootstrap.cjs');
const NextJsService = require('./NextJsService.cjs');
const PhoenixdService = require('./PhoenixdService.cjs');

class ServiceManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.devMode = options.devMode || isDevelopment();
    this.phoenixdService = new PhoenixdService();
    this.backendService = new BackendService();
    this.nextjsService = new NextJsService();
    this.ports = null;
    this.configs = null;
    this.phoenixdRemoteConfigured = false;
    this.externalServices = {
      phoenixd: false,
      backend: false,
    };
  }

  async startAll() {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Startup timed out after 2 minutes')), STARTUP.TIMEOUT_MILLISECONDS);
    });

    return Promise.race([this._startAll(), timeoutPromise]);
  }

  async _startAll() {
    try {
      logger.log('[ServiceManager] Starting all services...');

      this.ports = await allocatePorts();
      logger.log('[ServiceManager] Allocated ports:', this.ports);

      logger.log('[ServiceManager] Ensuring configurations...');
      this.configs = await ensureConfigurations(this.ports);

      const phoenixConfig = this.configs.phoenix;

      if (this.devMode) {
        logger.log('[ServiceManager] Development mode: skipping phoenixd and backend startup');
        logger.log('[ServiceManager] Assuming external services at:');
        logger.log('  - phoenixd: http://localhost:9740');
        logger.log('  - backend: http://localhost:9154');

        logger.log('[ServiceManager] Starting Next.js service...');
        const startedServiceInfo = await this.nextjsService.start(this.ports.nextjs, {
          host: 'localhost',
          port: this.ports.backend,
        });
        this.emit('service:started', { service: 'nextjs', port: this.ports.nextjs });
        logger.log('[ServiceManager] All services started successfully');
        return startedServiceInfo.url;
      }

      logger.log('[ServiceManager] Production mode: starting all bundled services');

      const nwcUriConfigured = Boolean(this.configs.ambrosia['nwc-uri']);
      this.phoenixdRemoteConfigured = this.configs.ambrosia['phoenixd-remote'] === 'true';

      if (nwcUriConfigured || this.phoenixdRemoteConfigured) {
        const skipReason = nwcUriConfigured ? 'NWC is the configured backend' : 'a remote phoenixd node is configured';
        logger.log(`[ServiceManager] Step 1: ${skipReason}, skipping Phoenixd startup`);
        this.externalServices.phoenixd = true;
        this.emit('service:started', { service: 'phoenixd', port: this.ports.phoenixd, skipped: true });
      } else {
        logger.log('[ServiceManager] Step 1: Checking for existing Phoenixd...');
        const phoenixdAlreadyRunning = await isPhoenixdRunning(DEFAULT_PORTS.phoenixd);

        if (phoenixdAlreadyRunning) {
          logger.log(`[ServiceManager] Phoenixd already running on port ${DEFAULT_PORTS.phoenixd}, reusing...`);
          this.ports.phoenixd = DEFAULT_PORTS.phoenixd;
          this.externalServices.phoenixd = true;
        } else {
          logger.log('[ServiceManager] Starting Phoenixd...');
          await this.phoenixdService.start(this.ports.phoenixd, phoenixConfig);
        }
        this.emit('service:started', { service: 'phoenixd', port: this.ports.phoenixd });
      }

      logger.log('[ServiceManager] Step 2: Checking for existing Backend...');
      const backendAlreadyRunning = await isBackendRunning(DEFAULT_PORTS.backend);

      if (backendAlreadyRunning) {
        logger.log(`[ServiceManager] Backend already running on port ${DEFAULT_PORTS.backend}, reusing...`);
        this.ports.backend = DEFAULT_PORTS.backend;
        this.externalServices.backend = true;
      } else {
        logger.log('[ServiceManager] Starting Backend...');
        await this.backendService.start(this.ports.backend, {
          phoenixdPort: this.ports.phoenixd,
          phoenixPassword: phoenixConfig['http-password'],
          webhookSecret: phoenixConfig['webhook-secret'],
          phoenixdRemoteConfigured: this.phoenixdRemoteConfigured,
        });
      }
      this.emit('service:started', { service: 'backend', port: this.ports.backend });

      logger.log('[ServiceManager] Step 3: Starting Next.js...');
      const startedServiceInfo = await this.nextjsService.start(this.ports.nextjs, {
        host: '127.0.0.1',
        port: this.ports.backend,
      });
      this.emit('service:started', { service: 'nextjs', port: this.ports.nextjs });

      logger.log('[ServiceManager] All services started successfully');
      this.startHealthMonitor();
      this.emit('all:started');

      return startedServiceInfo.url;
    } catch (startupError) {
      logger.error('[ServiceManager] Failed to start services:', startupError);
      this.emit('service:error', { serviceError: startupError });
      await this.stopAll();
      throw startupError;
    }
  }

  startHealthMonitor() {
    this._healthMonitor = setInterval(() => {
      const statuses = this.getServiceStatuses();
      for (const [service, status] of Object.entries(statuses)) {
        if (this.externalServices[service]) continue;
        if (status === 'error' || status === 'stopped') {
          logger.warn(`[ServiceManager] Health monitor: ${service} is ${status}, emitting event`);
          this.emit('service:error', { service, serviceError: new Error(`${service} is ${status}`) });
        }
      }
    }, HEALTH.MONITOR_INTERVAL_MILLISECONDS);
  }

  stopHealthMonitor() {
    if (this._healthMonitor) {
      clearInterval(this._healthMonitor);
      this._healthMonitor = null;
    }
  }

  async stopAll() {
    this.stopHealthMonitor();
    logger.log('[ServiceManager] Stopping all services...');

    try {
      logger.log('[ServiceManager] Stopping Next.js...');
      await this.nextjsService.stop();
    } catch (stopNextJsError) {
      logger.error('[ServiceManager] Error stopping Next.js:', stopNextJsError);
    }

    if (!this.devMode) {
      if (!this.externalServices.backend) {
        try {
          logger.log('[ServiceManager] Stopping Backend...');
          await this.backendService.stop();
        } catch (stopBackendError) {
          logger.error('[ServiceManager] Error stopping Backend:', stopBackendError);
        }
      } else {
        logger.log('[ServiceManager] Backend is external, not stopping');
      }

      if (!this.externalServices.phoenixd) {
        try {
          logger.log('[ServiceManager] Stopping Phoenixd...');
          await this.phoenixdService.stop();
        } catch (stopPhoenixdError) {
          logger.error('[ServiceManager] Error stopping Phoenixd:', stopPhoenixdError);
        }
      } else {
        logger.log('[ServiceManager] Phoenixd is external, not stopping');
      }
    }

    logger.log('[ServiceManager] All services stopped');
    this.emit('all:stopped');
  }

  getServiceStatuses() {
    return {
      phoenixd: this.phoenixdService.getStatus(),
      backend: this.backendService.getStatus(),
      nextjs: this.nextjsService.getStatus(),
    };
  }

  getPorts() {
    return {
      phoenixd: this.phoenixdService.getPort(),
      backend: this.backendService.getPort(),
      nextjs: this.nextjsService.getPort(),
    };
  }

  async restartService(serviceName) {
    if (this.externalServices[serviceName]) {
      logger.log(`[ServiceManager] Skipping restart of external service: ${serviceName}`);
      return;
    }

    logger.log(`[ServiceManager] Restarting ${serviceName}...`);

    try {
      switch (serviceName) {
        case 'phoenixd':
          await this.phoenixdService.stop();
          await this.phoenixdService.start(this.ports.phoenixd, this.configs.phoenix);
          this.externalServices.phoenixd = false;
          break;
        case 'backend':
          await this.backendService.stop();
          await this.backendService.start(this.ports.backend, {
            phoenixdPort: this.ports.phoenixd,
            phoenixPassword: this.configs.phoenix['http-password'],
            webhookSecret: this.configs.phoenix['webhook-secret'],
            phoenixdRemoteConfigured: this.phoenixdRemoteConfigured,
          });
          break;
        case 'nextjs':
          await this.nextjsService.stop();
          await this.nextjsService.start(this.ports.nextjs, {
            host: 'localhost',
            port: this.ports.backend,
          });
          break;
        default:
          throw new Error(`Unknown service: ${serviceName}`);
      }
      logger.log(`[ServiceManager] ${serviceName} restarted successfully`);
      this.emit('service:restarted', { service: serviceName });
    } catch (restartError) {
      logger.error(`[ServiceManager] Failed to restart ${serviceName}:`, restartError);
      this.emit('service:error', { service: serviceName, serviceError: restartError });
      throw restartError;
    }
  }

  isDevMode() {
    return this.devMode;
  }
}

module.exports = ServiceManager;
