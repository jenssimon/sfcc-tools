const fs = require('fs');
const DWDAV = require('dwdav');
const Steps = require('cli-step');
const chalk = require('chalk');
const archiver = require('archiver-promise');

module.exports = async (options) => {
  const {
    credentials: config,
    version,
    root,
    additionalSteps,
  } = options;
  const rootDir = root || './dist/';
  const dwdav = new DWDAV({
    ...config,
    folder: 'Cartridges',
    version,
  });

  let stepText;
  let step;
  let steps;

  const finishStep = (success) => {
    if (success) {
      step.success(`${stepText} - ${chalk.bold.green('OK')}`);
    } else {
      step.error(`${stepText} - ${chalk.bold.red('FAIL')}`);
    }
    return true;
  };

  const defineStep = (prmStepText, emoji, fn, specialFinish) => async () => {
    stepText = typeof prmStepText !== 'function' ? prmStepText : prmStepText({
      options, dwdav, rootDir, step, stepText,
    });
    step = steps
      .advance(stepText, emoji)
      .start();

    const ret = await fn();

    if (!specialFinish) {
      finishStep(true);
    }
    return ret;
  };

  const additionalActiveSteps = additionalSteps
    ? additionalSteps
      .filter(additionalStep => options[additionalStep.condition])
      .map(({
        name, emoji, fn, specialFinish,
      }) => defineStep(name, emoji, () => fn({
        options, dwdav, rootDir, step, stepText,
      }), specialFinish))
    : [];
  const stepCount = 6 + additionalActiveSteps.length;
  steps = new Steps(stepCount);

  const zipFileName = 'cartridges.zip';
  const zipFile = rootDir + zipFileName;

  const zipCartridges = defineStep('Creating ZIP', 'hammer', async () => {
    const archive = archiver(zipFile, {
      zlib: { level: 9 },
    });
    archive.directory(`${rootDir}cartridges/`, false);
    await archive.finalize();

    const stats = fs.statSync(zipFile);
    const sizeMb = (stats.size / 1024 / 1024).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    step.success(`${stepText} - ${chalk.green(sizeMb)} MB - ${chalk.bold.green('OK')}`);
  }, true);

  const checkConnection = defineStep('Check connection', 'earth_africa', async () => {
    await dwdav.get('..');
  });

  const checkCodeVersionExistance = defineStep('Check for existing code version', 'mag', async () => {
    let codeVersionExists;
    try {
      await dwdav.get('.');
      codeVersionExists = true;
    } catch (e) {
      codeVersionExists = false;
    }

    if (codeVersionExists) {
      await dwdav.delete('.');
      step.success(`${stepText} - ${chalk.bold.green('Deleted existing version')}`);
    } else {
      step.success(`${stepText} - ${chalk.bold.green('Not found')}`);
    }
  }, true);

  const uploadZip = defineStep('Uploading ZIP', 'truck', async () => {
    await dwdav.post(`${rootDir}cartridges.zip`, rootDir);
  });

  const unzip = defineStep('Unzipping', 'gift', async () => {
    await dwdav.unzip(zipFileName);
  });

  const deleteZip = defineStep('Delete remote ZIP', 'wastebasket', async () => {
    await dwdav.delete(zipFileName);
  });

  try {
    await zipCartridges();
    await checkConnection();
    await checkCodeVersionExistance();
    await uploadZip();
    await unzip();
    await deleteZip();
    additionalActiveSteps.forEach(async (additionalStep) => {
      await additionalStep();
    });
  } catch (e) {
    finishStep(false);
    console.log(e); // eslint-disable-line no-console
  }
};
