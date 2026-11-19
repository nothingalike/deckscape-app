const { build } = require('./package.json');
const distribution = require('./electron-builder.distribution.cjs');
const signed = process.env.NEUROSCAPE_SIGN_RELEASE === 'true';
const base = signed && process.platform !== 'linux' ? distribution : build;

module.exports = {
  ...base,
  directories: { ...base.directories, output: 'release/github' },
  publish: [],
  win: { ...base.win, artifactName: 'Neuroscape-Local-${version}-Windows-${arch}-Setup.${ext}' },
  mac: {
    ...base.mac,
    minimumSystemVersion: '13.0',
    ...(!signed ? { identity: '-', hardenedRuntime: false, notarize: false } : {}),
    artifactName: 'Neuroscape-Local-${version}-macOS-${arch}.${ext}',
  },
  linux: { ...base.linux, artifactName: 'Neuroscape-Local-${version}-Linux-x64.${ext}' },
};
