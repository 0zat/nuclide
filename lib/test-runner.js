'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

// This file is transpiled by Atom - not by nuclide-node-transpiler.
// `require` is used here to avoid `import` hoisting load other issues.

const invariant = require('assert');

// When chromiums verbosity is off, patch `console` to output through the main
// process. `--v=-3` is used by the CI.
if (process.argv.indexOf('--v=-3')) {
  const {Console} = require('console');
  const electron = require('electron');
  const {ipcRenderer} = electron;
  invariant(ipcRenderer != null);
  // https://github.com/nodejs/node/blob/v5.1.1/lib/console.js
  global.console = new Console(
    /* stdout */ {write(chunk) { ipcRenderer.send('write-to-stdout', chunk); }},
    /* stderr */ {write(chunk) { ipcRenderer.send('write-to-stderr', chunk); }},
  );
}

// Patch Atom's transpiler to ensure that our transforms are applied to tests:
require('./internal/atom-babel-compiler-patcher');

import type {TestRunnerParams, ExitCode} from './types';

const path = require('path');
const integrationTestsDir = path.join(__dirname, '../spec');

export default async function(params: TestRunnerParams): Promise<ExitCode> {
  const isIntegrationTest = params.testPaths
    .some(testPath => testPath.startsWith(integrationTestsDir));

  const statusCode = await params.legacyTestRunner({
    logFile: params.logFile,
    headless: params.headless,
    testPaths: params.testPaths,
    buildAtomEnvironment(buildEnvParams) {
      const atomGlobal = params.buildAtomEnvironment(buildEnvParams);

      if (isIntegrationTest) {
        jasmine.getEnv().beforeEach(() => {
          // If we're running integration tests in parallel, double the timeout.
          if (process.env.SANDCASTLE === '1') {
            jasmine.getEnv().defaultTimeoutInterval = 10000;
          }
          // `atom.confirm` blocks Atom and stops the integration tests.
          spyOn(atomGlobal, 'confirm');
          // Ensure 3rd-party packages are not installed via the
          // 'atom-package-deps' package when the 'nuclide' package is activated.
          // They are assumed to be already in ~/.atom/packages. js_test_runner.py
          // handles installing them during automated testing.
          atomGlobal.config.set('nuclide.installRecommendedPackages', false);
        });

        jasmine.getEnv().afterEach(() => {
          if (atomGlobal.confirm.calls.length) {
            const details = atomGlobal.confirm.argsForCall
              .map((args, i) => `call #${i} with ${JSON.stringify(args)}`);
            throw new Error('atom.confirm was called.\n' + details);
          }
        });
      }

      return atomGlobal;
    },
  });

  await new Promise(resolve => {
    // Atom intercepts "process.exit" so we have to do our own manual cleanup.
    const temp = require('temp');
    temp.cleanup((err, stats) => {
      resolve();
      if (err && err.message !== 'not tracking') {
        // eslint-disable-next-line no-console
        console.log(`temp.cleanup() failed. ${err}`);
      }
    });
  });

  return statusCode;
}
