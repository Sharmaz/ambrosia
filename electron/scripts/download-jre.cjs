const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const { DOWNLOAD } = require('../utils/constants.js');

const { getBuildPlatform } = require('./platform-utils.cjs');
const { verifySha256, fetchAdoptiumChecksum } = require('./verify-checksum.cjs');

const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'jre');

const JRE_VERSION = DOWNLOAD.JRE_VERSION;
const ADOPTIUM_ASSETS = `https://api.adoptium.net/v3/assets/latest/${JRE_VERSION}/hotspot`;

const ALL_JRE_DOWNLOADS = {
  'macos-x64': {
    platform: 'macos-x64',
    url: `https://api.adoptium.net/v3/binary/latest/${JRE_VERSION}/ga/mac/x64/jre/hotspot/normal/eclipse?project=jdk`,
    checksumApiUrl: `${ADOPTIUM_ASSETS}?architecture=x64&image_type=jre&os=mac&project=jdk&vendor=eclipse`,
    filename: 'jre-macos-x64.tar.gz',
  },
  'macos-arm64': {
    platform: 'macos-arm64',
    url: `https://api.adoptium.net/v3/binary/latest/${JRE_VERSION}/ga/mac/aarch64/jre/hotspot/normal/eclipse?project=jdk`,
    checksumApiUrl: `${ADOPTIUM_ASSETS}?architecture=aarch64&image_type=jre&os=mac&project=jdk&vendor=eclipse`,
    filename: 'jre-macos-arm64.tar.gz',
  },
  'win-x64': {
    platform: 'win-x64',
    url: `https://api.adoptium.net/v3/binary/latest/${JRE_VERSION}/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk`,
    checksumApiUrl: `${ADOPTIUM_ASSETS}?architecture=x64&image_type=jre&os=windows&project=jdk&vendor=eclipse`,
    filename: 'jre-win-x64.zip',
  },
  'win-arm64': {
    platform: 'win-arm64',
    url: `https://api.adoptium.net/v3/binary/latest/${JRE_VERSION}/ga/windows/aarch64/jre/hotspot/normal/eclipse?project=jdk`,
    checksumApiUrl: `${ADOPTIUM_ASSETS}?architecture=aarch64&image_type=jre&os=windows&project=jdk&vendor=eclipse`,
    filename: 'jre-win-arm64.zip',
  },
  'linux-x64': {
    platform: 'linux-x64',
    url: `https://api.adoptium.net/v3/binary/latest/${JRE_VERSION}/ga/linux/x64/jre/hotspot/normal/eclipse?project=jdk`,
    checksumApiUrl: `${ADOPTIUM_ASSETS}?architecture=x64&image_type=jre&os=linux&project=jdk&vendor=eclipse`,
    filename: 'jre-linux-x64.tar.gz',
  },
  'linux-arm64': {
    platform: 'linux-arm64',
    url: `https://api.adoptium.net/v3/binary/latest/${JRE_VERSION}/ga/linux/aarch64/jre/hotspot/normal/eclipse?project=jdk`,
    checksumApiUrl: `${ADOPTIUM_ASSETS}?architecture=aarch64&image_type=jre&os=linux&project=jdk&vendor=eclipse`,
    filename: 'jre-linux-arm64.tar.gz',
  },
};

const currentPlatform = getBuildPlatform();

let JRE_DOWNLOADS;
if (currentPlatform === 'win-arm64') {
  const nativeBackendJre = ALL_JRE_DOWNLOADS['win-arm64'];
  const emulatedPhoenixdJvmJre = ALL_JRE_DOWNLOADS['win-x64'];
  JRE_DOWNLOADS = [nativeBackendJre, emulatedPhoenixdJvmJre];
} else {
  JRE_DOWNLOADS = [ALL_JRE_DOWNLOADS[currentPlatform]];
}

function downloadFile(url, destination, redirectCount = 0) {
  const MAX_REDIRECTS = DOWNLOAD.MAX_REDIRECTS;
  return new Promise((resolve, reject) => {
    const destinationFileStream = fs.createWriteStream(destination);
    const protocol = url.startsWith('https') ? https : http;

    console.log(`Downloading: ${url}`);
    console.log(`To: ${destination}`);

    const downloadRequest = protocol.get(url, (downloadResponse) => {
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

function extractArchive(archivePath, platform, destinationDirectory) {
  console.log(`Extracting ${archivePath}...`);

  if (!fs.existsSync(destinationDirectory)) {
    fs.mkdirSync(destinationDirectory, { recursive: true });
  }

  try {
    if (archivePath.endsWith('.tar.gz')) {
      execSync(`tar -xzf "${archivePath}" -C "${destinationDirectory}"`, { stdio: 'inherit' });

      const extractedDirectories = fs.readdirSync(destinationDirectory).filter((entryName) => {
        const fullPath = path.join(destinationDirectory, entryName);
        return fs.statSync(fullPath).isDirectory();
      });

      if (extractedDirectories.length > 0) {
        const extractedDirectory = path.join(destinationDirectory, extractedDirectories[0]);

        let sourceDirectory = extractedDirectory;
        if (platform.startsWith('macos')) {
          const contentsHome = path.join(extractedDirectory, 'Contents', 'Home');
          if (fs.existsSync(contentsHome)) {
            sourceDirectory = contentsHome;
            console.log('Detected macOS JRE structure (Contents/Home), extracting from nested directory...');
          }
        }

        const childEntryNames = fs.readdirSync(sourceDirectory);

        childEntryNames.forEach((entryName) => {
          const oldPath = path.join(sourceDirectory, entryName);
          const newPath = path.join(destinationDirectory, entryName);
          if (fs.existsSync(newPath)) {
            fs.rmSync(newPath, { recursive: true, force: true });
          }
          fs.renameSync(oldPath, newPath);
        });

        fs.rmSync(extractedDirectory, { recursive: true, force: true });
      }
    } else if (archivePath.endsWith('.zip')) {
      if (process.platform === 'win32') {
        const powershellCommand = `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destinationDirectory}' -Force"`;
        execSync(powershellCommand, { stdio: 'inherit' });
      } else {
        execSync(`unzip -q "${archivePath}" -d "${destinationDirectory}"`, { stdio: 'inherit' });
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
    }

    console.log(`Extracted to: ${destinationDirectory}\n`);
  } catch (extractionError) {
    console.error(`Error extracting archive: ${extractionError.message}`);
    throw extractionError;
  }
}

async function downloadAndExtractJRE(platform, url, checksumApiUrl, filename) {
  const platformDirectory = path.join(RESOURCES_DIR, platform);
  const downloadPath = path.join(RESOURCES_DIR, filename);

  if (fs.existsSync(platformDirectory) && fs.readdirSync(platformDirectory).length > 0) {
    console.log(`✓ JRE for ${platform} already exists, skipping download\n`);
    return;
  }

  console.log(`\n=== Downloading JRE for ${platform} ===`);

  try {
    if (!fs.existsSync(RESOURCES_DIR)) {
      fs.mkdirSync(RESOURCES_DIR, { recursive: true });
    }

    await downloadFile(url, downloadPath);

    try {
      console.log(`Fetching checksum from Adoptium API: ${checksumApiUrl}`);
      const expectedHash = await fetchAdoptiumChecksum(checksumApiUrl);
      await verifySha256(downloadPath, expectedHash);
    } catch (checksumError) {
      fs.unlinkSync(downloadPath);
      throw new Error(`Integrity check failed: ${checksumError.message}`);
    }

    extractArchive(downloadPath, platform, platformDirectory);

    const javaExecutable = platform.startsWith('win') ? 'java.exe' : 'java';
    const javaPath = path.join(platformDirectory, 'bin', javaExecutable);

    if (fs.existsSync(javaPath)) {
      console.log(`✓ Successfully installed JRE for ${platform}`);
      if (!platform.startsWith('win')) {
        fs.chmodSync(javaPath, 0o755);
      }
    } else {
      throw new Error(`Java executable not found at ${javaPath}`);
    }

    fs.unlinkSync(downloadPath);
  } catch (installError) {
    console.error(`✗ Failed to download JRE for ${platform}: ${installError.message}`);
    throw installError;
  }
}

async function main() {
  console.log('===========================================');
  console.log(`  Downloading JRE ${DOWNLOAD.JRE_VERSION} for ${currentPlatform}`);
  console.log('===========================================\n');

  await Promise.all(
    JRE_DOWNLOADS.map(async (jreDownload) => {
      try {
        await downloadAndExtractJRE(jreDownload.platform, jreDownload.url, jreDownload.checksumApiUrl, jreDownload.filename);
      } catch (jreInstallError) {
        console.error(`Failed to download JRE for ${jreDownload.platform}:`, jreInstallError);
        process.exit(1);
      }
    }),
  );

  console.log('\n===========================================');
  console.log(`  ✓ JRE download for ${currentPlatform} complete!`);
  console.log('===========================================');
  process.exit(0);
}

main().catch((fatalError) => {
  console.error('Fatal error:', fatalError);
  process.exit(1);
});
