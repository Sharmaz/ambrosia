import { execSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';

import { DOWNLOAD } from '../utils/constants.js';

import { getBuildPlatform } from './platform-utils.js';
import { verifySha256, fetchSha256SumsChecksum } from './verify-checksum.js';

const NODE_VERSION = 'v24.15.0';
const RESOURCES_DIRECTORY = path.join(import.meta.dirname, '..', 'resources', 'node');

const SHASUMS_URL = `https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`;

const ALL_NODE_DOWNLOADS = {
  'macos-x64': {
    platform: 'macos-x64',
    downloadUrl: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-x64.tar.gz`,
    filename: `node-${NODE_VERSION}-darwin-x64.tar.gz`,
  },
  'macos-arm64': {
    platform: 'macos-arm64',
    downloadUrl: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-arm64.tar.gz`,
    filename: `node-${NODE_VERSION}-darwin-arm64.tar.gz`,
  },
  'win-x64': {
    platform: 'win-x64',
    downloadUrl: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`,
    filename: `node-${NODE_VERSION}-win-x64.zip`,
  },
  'win-arm64': {
    platform: 'win-arm64',
    downloadUrl: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-arm64.zip`,
    filename: `node-${NODE_VERSION}-win-arm64.zip`,
  },
  'linux-x64': {
    platform: 'linux-x64',
    downloadUrl: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.gz`,
    filename: `node-${NODE_VERSION}-linux-x64.tar.gz`,
  },
  'linux-arm64': {
    platform: 'linux-arm64',
    downloadUrl: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-arm64.tar.gz`,
    filename: `node-${NODE_VERSION}-linux-arm64.tar.gz`,
  },
};

const currentPlatform = getBuildPlatform();
const NODE_DOWNLOADS = [ALL_NODE_DOWNLOADS[currentPlatform]];

const MAX_REDIRECTS = DOWNLOAD.MAX_REDIRECTS;

function downloadFile(url, destination, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    const destinationFileStream = fs.createWriteStream(destination);

    https.get(url, (downloadResponse) => {
      if (downloadResponse.statusCode === 301 || downloadResponse.statusCode === 302 ||
          downloadResponse.statusCode === 307 || downloadResponse.statusCode === 308) {
        destinationFileStream.close();
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`Too many redirects (max ${MAX_REDIRECTS})`));
          return;
        }
        return downloadFile(downloadResponse.headers.location, destination, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }

      const totalSize = parseInt(downloadResponse.headers['content-length'], 10);
      let downloadedSize = 0;
      let lastPercent = 0;

      downloadResponse.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const percent = Math.floor((downloadedSize / totalSize) * 100);
        if (percent !== lastPercent && percent % 10 === 0) {
          console.log(`  ${percent}%`);
          lastPercent = percent;
        }
      });

      downloadResponse.pipe(destinationFileStream);

      destinationFileStream.on('finish', () => {
        destinationFileStream.close();
        console.log('✓ Download complete\n');
        resolve();
      });
    }).on('error', (requestError) => {
      fs.unlink(destination, () => {});
      reject(requestError);
    });
  });
}

function extractArchive(archivePath, platform, destinationDirectory) {
  console.log(`Extracting: ${path.basename(archivePath)}`);

  if (platform.startsWith('win')) {
    const powershellCommand = `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destinationDirectory}' -Force"`;
    execSync(powershellCommand, { stdio: 'inherit' });

    const extractedDirectory = path.join(destinationDirectory, path.basename(archivePath, '.zip'));
    const childEntryNames = fs.readdirSync(extractedDirectory);
    childEntryNames.forEach((entryName) => {
      fs.renameSync(
        path.join(extractedDirectory, entryName),
        path.join(destinationDirectory, entryName),
      );
    });
    fs.rmSync(extractedDirectory, { recursive: true, force: true });
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${destinationDirectory}" --strip-components=1`, { stdio: 'inherit' });
  }

  console.log('✓ Extraction complete\n');
}

async function main() {
  console.log('===========================================');
  console.log('  Downloading Node.js Binary');
  console.log('===========================================');
  console.log(`Platform: ${currentPlatform}\n`);

  if (!fs.existsSync(RESOURCES_DIRECTORY)) {
    fs.mkdirSync(RESOURCES_DIRECTORY, { recursive: true });
  }

  for (const nodeDownload of NODE_DOWNLOADS) {
    const platformDirectory = path.join(RESOURCES_DIRECTORY, nodeDownload.platform);
    const archivePath = path.join(RESOURCES_DIRECTORY, nodeDownload.filename);

    const nodeBinary = nodeDownload.platform.startsWith('win')
      ? path.join(platformDirectory, 'node.exe')
      : path.join(platformDirectory, 'bin', 'node');

    if (fs.existsSync(nodeBinary)) {
      console.log(`✓ Node.js ${nodeDownload.platform} already exists, skipping...\n`);
      continue;
    }

    console.log(`Processing: ${nodeDownload.platform}`);

    await downloadFile(nodeDownload.downloadUrl, archivePath);

    try {
      console.log(`Fetching checksums from: ${SHASUMS_URL}`);
      const expectedHash = await fetchSha256SumsChecksum(SHASUMS_URL, nodeDownload.filename);
      await verifySha256(archivePath, expectedHash);
    } catch (checksumError) {
      fs.unlinkSync(archivePath);
      throw new Error(`Integrity check failed: ${checksumError.message}`);
    }

    if (!fs.existsSync(platformDirectory)) {
      fs.mkdirSync(platformDirectory, { recursive: true });
    }

    extractArchive(archivePath, nodeDownload.platform, platformDirectory);

    fs.unlinkSync(archivePath);

    if (fs.existsSync(nodeBinary)) {
      console.log(`✓ Node.js ${nodeDownload.platform} installed successfully\n`);
    } else {
      throw new Error(`Failed to extract Node.js for ${nodeDownload.platform}`);
    }
  }

  console.log('===========================================');
  console.log(`  ✓ Node.js binary for ${currentPlatform} downloaded!`);
  console.log('===========================================');
}

main()
  .then(() => process.exit(0))
  .catch((fatalError) => {
    console.error('\n✗ Error:', fatalError.message);
    process.exit(1);
  });
