const { build } = require('./package.json');

module.exports = {
  ...build,
  directories: { ...build.directories, output: 'dist-store' },
  publish: null,
  forceCodeSigning: false, // Partner Center signs the uploaded Store package.
  extraMetadata: { distributionChannel: 'microsoft-store' },
  win: { ...build.win, target: [{ target: 'appx', arch: ['x64'] }], signAndEditExecutable: false },
  appx: {
    ...build.appx,
    artifactName: 'Brown-AI-Store-${version}-${arch}.${ext}',
    electronUpdaterAware: false,
    backgroundColor: '#000000',
  },
};
