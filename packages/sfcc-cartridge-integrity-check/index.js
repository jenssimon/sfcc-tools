const fs = require('fs');
const shell = require('shelljs');
const chalk = require('chalk');
const { table, getBorderCharacters } = require('table');

const getDirHashes = readOnlyCartridges => readOnlyCartridges.reduce((acc, cartridge) => {
  const res = shell.exec(`git rev-list -1 HEAD -- cartridges/${cartridge}/`, { silent: true });
  acc[cartridge] = res.stdout.trim();
  return acc;
}, {});

const getUncommitted = (cartridge) => {
  const res = shell.exec(`git ls-files -m cartridges/${cartridge}/`, { silent: true });
  return res.stdout.trim().split('\n').filter(line => !!line.trim()).length;
};

const listNotAllowedCommitsForCartridge = (cartridge, hash) => shell.exec(
  `git log --color --format="%C(auto)%H %Cgreen%aN <%aE> %C(auto)%s" ${hash}..HEAD -- cartridges/${cartridge}/`,
  { silent: true },
).stdout;

const checkCartridgeIntegrity = (readOnlyCartridges, currIntegrityData, customizationProject) => {
  if (customizationProject) {
    const hashes = getDirHashes(readOnlyCartridges, currIntegrityData);
    const modifiedCartridges = [];
    const uncommittedChanges = [];
    const integrityData = {};
    Object.entries(hashes).forEach(([cartridge, hash]) => {
      integrityData[cartridge] = {
        hash,
        uncommitted: getUncommitted(cartridge),
      };
    });
    Object.entries(integrityData).forEach(([cartridge, { hash, uncommitted }]) => {
      const ok = hash === currIntegrityData[cartridge];
      const isUncommitted = !!uncommitted;
      process.stdout.write(`Integrity for ${cartridge} - ${
        ok ? chalk.bold.green('OK ✅') : chalk.bold.red('FAIL ❌')
      }${uncommitted ? ` - ${chalk.bold.yellow(`${uncommitted} uncommitted file(s)`)}` : ''}\n`);
      if (!ok) {
        modifiedCartridges.push(cartridge);
        process.stdout.write(`\n${listNotAllowedCommitsForCartridge(cartridge, currIntegrityData[cartridge])}\n`);
      }
      if (isUncommitted) {
        uncommittedChanges.push(cartridge);
      }
    });
    if (modifiedCartridges.length) {
      process.stdout.write(chalk.bold.red('\n🛑 Some read only cartridges are modified!!!\n'));
    }
    if (uncommittedChanges.length) {
      // eslint-disable-next-line max-len
      process.stdout.write(chalk.bold.yellow('\n✋ You have uncommitted changes in read-only cartridge(s)!\nDo you really want to modify these cartridge(s)?\n'));
    }
  } else {
    // eslint-disable-next-line max-len
    process.stdout.write(chalk.bold.yellow('🙈 Ignoring cartridge integrity check since this is not a customization project.\n'));
  }
};

const generateCartridgeIntegrityDataFile = function (readOnlyCartridges, filename) {
  const hashes = getDirHashes(readOnlyCartridges);
  process.stdout.write('Generated hashes for:\n');
  const data = [];
  Object.entries(hashes).forEach(([cartridge, hash]) => {
    data.push([chalk.bold.whiteBright(cartridge), hash]);
  });
  process.stdout.write(table(data, {
    border: getBorderCharacters('void'),
    columnDefault: {
      paddingLeft: 0,
      paddingRight: 1,
    },
    drawHorizontalLine: () => false,
  }));
  fs.writeFileSync(filename, JSON.stringify(hashes));
};

module.exports = ({
  readOnlyCartridges,
  integrityData,
  customizationProject,
}) => ({
  checkCartridgeIntegrity: checkCartridgeIntegrity.bind(null, readOnlyCartridges, integrityData, customizationProject),
  generateCartridgeIntegrityDataFile: generateCartridgeIntegrityDataFile.bind(null, readOnlyCartridges),
});
