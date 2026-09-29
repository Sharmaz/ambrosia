import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { logger } from '../utils/logger.js';
import { getDataDirectory, getPhoenixDataDirectory, getLogsDirectory } from '../utils/resourcePaths.js';

import { serverSecretStore } from './ServerSecretStore.js';

function generateRandomHex(byteLength) {
  return crypto.randomBytes(byteLength).toString('hex');
}

function ensureDirectoryExists(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
    logger.log(`[ConfigurationBootstrap] Created directory: ${directoryPath}`);
  }
}

function configExists() {
  const dataDirectory = getDataDirectory();
  const phoenixDirectory = getPhoenixDataDirectory();
  const ambrosiaConfigPath = path.join(dataDirectory, 'ambrosia.conf');
  const phoenixConfigPath = path.join(phoenixDirectory, 'phoenix.conf');

  return fs.existsSync(ambrosiaConfigPath) && fs.existsSync(phoenixConfigPath);
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const configFileContent = fs.readFileSync(configPath, 'utf-8');
  const configEntries = {};

  configFileContent.split('\n').forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        configEntries[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return configEntries;
}

function writeConfig(configPath, configEntries) {
  const configFileLines = Object.entries(configEntries).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(configPath, `${configFileLines.join('\n')}\n`, { encoding: 'utf-8', mode: 0o600 });
  logger.log(`[ConfigurationBootstrap] Written configuration to: ${configPath}`);
}

async function ensureConfigurations(ports) {
  const dataDirectory = getDataDirectory();
  const phoenixDirectory = getPhoenixDataDirectory();
  const logsDirectory = getLogsDirectory();

  ensureDirectoryExists(dataDirectory);
  ensureDirectoryExists(phoenixDirectory);
  ensureDirectoryExists(logsDirectory);

  const ambrosiaConfigPath = path.join(dataDirectory, 'ambrosia.conf');
  const phoenixConfigPath = path.join(phoenixDirectory, 'phoenix.conf');

  let ambrosiaConfig = readConfig(ambrosiaConfigPath);
  let phoenixConfig = readConfig(phoenixConfigPath);

  let needsUpdate = false;

  if (!fs.existsSync(ambrosiaConfigPath) || Object.keys(ambrosiaConfig).length === 0) {
    logger.log('[ConfigurationBootstrap] Generating Ambrosia configuration...');

    ambrosiaConfig = {
      'http-bind-ip': '127.0.0.1',
      'http-bind-port': ports.backend.toString(),
      'phoenixd-url': `http://localhost:${ports.phoenixd}`,
    };

    writeConfig(ambrosiaConfigPath, ambrosiaConfig);
    needsUpdate = true;
  } else {
    ambrosiaConfig['http-bind-port'] = ports.backend.toString();

    const phoenixdRemoteConfigured = ambrosiaConfig['phoenixd-remote'] === 'true';
    if (!phoenixdRemoteConfigured) {
      ambrosiaConfig['phoenixd-url'] = `http://localhost:${ports.phoenixd}`;
    }
  }

  if (!serverSecretStore.read()) {
    const legacyPlaintextSecret = ambrosiaConfig.secret;
    if (legacyPlaintextSecret) {
      logger.log('[ConfigurationBootstrap] Migrating the existing server secret to encrypted storage...');
      serverSecretStore.save(legacyPlaintextSecret);
    } else {
      logger.log('[ConfigurationBootstrap] Generating encrypted server secret...');
      serverSecretStore.save(generateRandomHex(32));
    }
  }

  if ('secret' in ambrosiaConfig || 'secret-hash' in ambrosiaConfig) {
    delete ambrosiaConfig.secret;
    delete ambrosiaConfig['secret-hash'];
    needsUpdate = true;
  }

  if (!fs.existsSync(phoenixConfigPath) || Object.keys(phoenixConfig).length === 0) {
    logger.log('[ConfigurationBootstrap] Generating Phoenix configuration...');
    const httpPassword = generateRandomHex(32);
    const httpPasswordLimitedAccess = generateRandomHex(32);
    const webhookSecret = generateRandomHex(32);

    phoenixConfig = {
      'http-password': httpPassword,
      'http-password-limited-access': httpPasswordLimitedAccess,
      'webhook-secret': webhookSecret,
      webhook: `http://127.0.0.1:${ports.backend}/webhook/phoenixd`,
      'auto-liquidity': 'off',
      'max-mining-fee': '5000',
    };

    writeConfig(phoenixConfigPath, phoenixConfig);
    needsUpdate = true;
  } else {
    phoenixConfig.webhook = `http://127.0.0.1:${ports.backend}/webhook/phoenixd`;
  }

  if (needsUpdate || !fs.existsSync(ambrosiaConfigPath) || !fs.existsSync(phoenixConfigPath)) {
    writeConfig(ambrosiaConfigPath, ambrosiaConfig);
    writeConfig(phoenixConfigPath, phoenixConfig);
  }

  return {
    ambrosia: ambrosiaConfig,
    phoenix: phoenixConfig,
  };
}

export const configurationBootstrap = {
  configExists,
  ensureConfigurations,
  readConfig,
  writeConfig,
  generateRandomHex,
};
