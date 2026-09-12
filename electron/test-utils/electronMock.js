let isPackaged = false;

const electronModuleExports = {
  app: {
    get isPackaged() {
      return isPackaged;
    },
  },
};

function installElectronMock() {
  const electronPath = require.resolve('electron');
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: electronModuleExports,
  };
}

function setIsPackaged(newIsPackaged) {
  isPackaged = newIsPackaged;
}

function resetElectronMock() {
  isPackaged = false;
}

module.exports = {
  installElectronMock,
  setIsPackaged,
  resetElectronMock,
};
