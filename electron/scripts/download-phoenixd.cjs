const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const { DOWNLOAD } = require('../utils/constants.js');

const { getBuildPlatform } = require('./platform-utils.cjs');
const { verifySha256, fetchSha256SumsChecksum } = require('./verify-checksum.cjs');

const PHOENIXD_VERSION = DOWNLOAD.PHOENIXD_VERSION;
const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'phoenixd');

const GITHUB_BASE = `https://github.com/ACINQ/phoenixd/releases/download/v${PHOENIXD_VERSION}`;

const SHA256SUMS_URL = `${GITHUB_BASE}/SHA256SUMS.asc`;

const ALL_PHOENIXD_DOWNLOADS = {
  'macos-x64': {
    platform: 'macos-x64',
    url: `${GITHUB_BASE}/phoenixd-${PHOENIXD_VERSION}-macos-x64.zip`,
    archiveFilename: `phoenixd-${PHOENIXD_VERSION}-macos-x64.zip`,
    filename: 'phoenixd-macos-x64.zip',
  },
  'macos-arm64': {
    platform: 'macos-arm64',
    url: `${GITHUB_BASE}/phoenixd-${PHOENIXD_VERSION}-macos-arm64.zip`,
    archiveFilename: `phoenixd-${PHOENIXD_VERSION}-macos-arm64.zip`,
    filename: 'phoenixd-macos-arm64.zip',
  },
  'win-x64': {
    platform: 'win-x64',
    url: `${GITHUB_BASE}/phoenixd-${PHOENIXD_VERSION}-jvm.zip`,
    archiveFilename: `phoenixd-${PHOENIXD_VERSION}-jvm.zip`,
    filename: 'phoenixd-win-x64.zip',
  },
  'win-arm64': {
    platform: 'win-arm64',
    url: `${GITHUB_BASE}/phoenixd-${PHOENIXD_VERSION}-jvm.zip`,
    archiveFilename: `phoenixd-${PHOENIXD_VERSION}-jvm.zip`,
    filename: 'phoenixd-win-arm64.zip',
  },
  'linux-x64': {
    platform: 'linux-x64',
    url: `${GITHUB_BASE}/phoenixd-${PHOENIXD_VERSION}-linux-x64.zip`,
    archiveFilename: `phoenixd-${PHOENIXD_VERSION}-linux-x64.zip`,
    filename: 'phoenixd-linux-x64.zip',
  },
  'linux-arm64': {
    platform: 'linux-arm64',
    url: `${GITHUB_BASE}/phoenixd-${PHOENIXD_VERSION}-linux-arm64.zip`,
    archiveFilename: `phoenixd-${PHOENIXD_VERSION}-linux-arm64.zip`,
    filename: 'phoenixd-linux-arm64.zip',
  },
};

const currentPlatform = getBuildPlatform();
const PHOENIXD_DOWNLOADS = [ALL_PHOENIXD_DOWNLOADS[currentPlatform]];

function downloadFile(url, destination, redirectCount = 0) {
  const MAX_REDIRECTS = DOWNLOAD.MAX_REDIRECTS;
  return new Promise((resolve, reject) => {
    const destinationFileStream = fs.createWriteStream(destination);

    console.log(`Downloading: ${url}`);
    console.log(`To: ${destination}`);

    const downloadRequest = https.get(url, (downloadResponse) => {
      if (downloadResponse.statusCode === 301 || downloadResponse.statusCode === 302 ||
          downloadResponse.statusCode === 307 || downloadResponse.statusCode === 308) {
        const redirectUrl = downloadResponse.headers.location;
        destinationFileStream.close();
        fs.unlinkSync(destination);
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`Too many redirects (max ${MAX_REDIRECTS})`));
          return;
        }
        console.log(`Following redirect (${downloadResponse.statusCode}) to: ${redirectUrl}`);
        downloadFile(redirectUrl, destination, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (downloadResponse.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${downloadResponse.statusCode}`));
        return;
      }

      const totalSize = parseInt(downloadResponse.headers['content-length'], 10);
      let downloadedSize = 0;
      let lastPercent = 0;

      downloadResponse.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const percent = Math.floor((downloadedSize / totalSize) * 100);
        if (percent !== lastPercent && percent % 10 === 0) {
          console.log(`Progress: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
          lastPercent = percent;
        }
      });

      downloadResponse.pipe(destinationFileStream);

      destinationFileStream.on('finish', () => {
        destinationFileStream.close();
        console.log('Download complete!\n');
        resolve();
      });
    });

    downloadRequest.on('error', (requestError) => {
      fs.unlink(destination, () => {});
      reject(requestError);
    });

    destinationFileStream.on('error', (fileStreamError) => {
      fs.unlink(destination, () => {});
      reject(fileStreamError);
    });
  });
}

function extractZip(zipPath, destinationDirectory) {
  console.log(`Extracting ${zipPath}...`);

  if (!fs.existsSync(destinationDirectory)) {
    fs.mkdirSync(destinationDirectory, { recursive: true });
  }

  try {
    if (process.platform === 'win32') {
      const powershellCommand = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destinationDirectory}' -Force"`;
      execSync(powershellCommand, { stdio: 'inherit' });
    } else {
      execSync(`unzip -q "${zipPath}" -d "${destinationDirectory}"`, { stdio: 'inherit' });
    }

    const extractedDirectories = fs.readdirSync(destinationDirectory).filter((entryName) => {
      const fullPath = path.join(destinationDirectory, entryName);
      return fs.statSync(fullPath).isDirectory();
    });

    if (extractedDirectories.length > 0) {
      const extractedDirectory = path.join(destinationDirectory, extractedDirectories[0]);
      const childEntryNames = fs.readdirSync(extractedDirectory);

      childEntryNames.forEach((entryName) => {
        const oldPath = path.join(extractedDirectory, entryName);
        const newPath = path.join(destinationDirectory, entryName);
        if (fs.existsSync(newPath)) {
          fs.rmSync(newPath, { recursive: true, force: true });
        }
        fs.renameSync(oldPath, newPath);
      });

      fs.rmSync(extractedDirectory, { recursive: true, force: true });
    }

    console.log(`Extracted to: ${destinationDirectory}\n`);
  } catch (extractionError) {
    console.error(`Error extracting archive: ${extractionError.message}`);
    throw extractionError;
  }
}

async function downloadAndExtractPhoenixd(platform, url, archiveFilename, filename) {
  const platformDirectory = path.join(RESOURCES_DIR, platform);
  const downloadPath = path.join(RESOURCES_DIR, filename);

  const isJvmVersion = url.includes('jvm');
  const phoenixdExecutable = isJvmVersion ? path.join('bin', 'phoenixd.bat') :
    platform.startsWith('win') ? 'phoenixd.exe' : 'phoenixd';
  const phoenixdPath = path.join(platformDirectory, phoenixdExecutable);

  if (fs.existsSync(phoenixdPath)) {
    console.log(`✓ Phoenixd for ${platform} already exists, skipping download\n`);
    return;
  }

  console.log(`\n=== Downloading Phoenixd for ${platform} ===`);

  try {
    if (!fs.existsSync(RESOURCES_DIR)) {
      fs.mkdirSync(RESOURCES_DIR, { recursive: true });
    }

    await downloadFile(url, downloadPath);

    try {
      console.log(`Fetching checksums from: ${SHA256SUMS_URL}`);
      const expectedHash = await fetchSha256SumsChecksum(SHA256SUMS_URL, archiveFilename);
      await verifySha256(downloadPath, expectedHash);
    } catch (checksumError) {
      fs.unlinkSync(downloadPath);
      throw new Error(`Integrity check failed: ${checksumError.message}`);
    }

    extractZip(downloadPath, platformDirectory);

    if (fs.existsSync(phoenixdPath)) {
      console.log(`✓ Successfully installed Phoenixd for ${platform}`);
      if (!platform.startsWith('win')) {
        fs.chmodSync(phoenixdPath, 0o755);
      }
    } else {
      throw new Error(`Phoenixd executable not found at ${phoenixdPath}`);
    }

    fs.unlinkSync(downloadPath);
  } catch (installError) {
    console.error(`✗ Failed to download Phoenixd for ${platform}: ${installError.message}`);
    throw installError;
  }
}

async function main() {
  console.log('===========================================');
  console.log(`  Downloading Phoenixd ${PHOENIXD_VERSION} for ${currentPlatform}`);
  console.log('===========================================\n');

  for (const phoenixdDownload of PHOENIXD_DOWNLOADS) {
    try {
      await downloadAndExtractPhoenixd(phoenixdDownload.platform, phoenixdDownload.url, phoenixdDownload.archiveFilename, phoenixdDownload.filename);
    } catch (phoenixdInstallError) {
      console.error(`Failed to download Phoenixd for ${phoenixdDownload.platform}:`, phoenixdInstallError);
      process.exit(1);
    }
  }

  console.log('\n===========================================');
  console.log(`  ✓ Phoenixd download for ${currentPlatform} complete!`);
  console.log('===========================================');
  process.exit(0);
}

main().catch((fatalError) => {
  console.error('Fatal error:', fatalError);
  process.exit(1);
});
