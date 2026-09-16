const findFreePort = require('find-free-port');

const { PORTS } = require('./constants.js');
const { logger } = require('./logger.js');
const { isDevelopment } = require('./resourcePaths.cjs');

const DEFAULT_PORTS = {
  phoenixd: PORTS.PHOENIXD_DEFAULT,
  backend: PORTS.BACKEND_DEFAULT,
  nextjs: PORTS.NEXTJS_DEFAULT,
};

async function allocatePorts() {
  if (isDevelopment()) {
    logger.log('[PortAllocator] Development mode: using default ports');
    return {
      phoenixd: DEFAULT_PORTS.phoenixd,
      backend: DEFAULT_PORTS.backend,
      nextjs: DEFAULT_PORTS.nextjs,
    };
  }

  logger.log('[PortAllocator] Production mode: allocating dynamic ports');

  try {
    const [phoenixdPort] = await findFreePort(PORTS.PHOENIXD_RANGE.min, PORTS.PHOENIXD_RANGE.max);
    const [backendPort] = await findFreePort(PORTS.BACKEND_RANGE.min, PORTS.BACKEND_RANGE.max);
    const [nextjsPort] = await findFreePort(PORTS.NEXTJS_RANGE.min, PORTS.NEXTJS_RANGE.max);

    const ports = {
      phoenixd: phoenixdPort,
      backend: backendPort,
      nextjs: nextjsPort,
    };

    logger.log('[PortAllocator] Allocated ports:', ports);
    return ports;
  } catch (allocationError) {
    logger.warn('[PortAllocator] Dynamic allocation failed, using defaults:', allocationError.message);
    return {
      phoenixd: DEFAULT_PORTS.phoenixd,
      backend: DEFAULT_PORTS.backend,
      nextjs: DEFAULT_PORTS.nextjs,
    };
  }
}

module.exports = {
  allocatePorts,
  DEFAULT_PORTS,
};
