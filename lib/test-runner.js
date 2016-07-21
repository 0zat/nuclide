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

// When chromiums verbosity is off, patch `console` to output through the main
// process. `--v=-3` is used by the CI.
if (process.argv.indexOf('--v=-3')) {
  const {Console} = require('console');
  const {ipcRenderer} = require('electron');
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
          // Ensure 3rd-party packages are not installed via the
          // 'atom-package-deps' package when the 'nuclide' package is activated.
          // They are assumed to be already in ~/.atom/packages. js_test_runner.py
          // handles installing them during automated testing.
          atomGlobal.config.set('nuclide.installRecommendedPackages', false);
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

  // This is the default behavior in Atom 1.9.0. In Atom <1.9.0, to get the same
  // behavior, you need to set `process.env.CI`. We don't do that because, among
  // other things, it sets jasmine's default timeout to 60s.
  // https://github.com/atom/atom/pull/11459
  const grim = global.__grim__;
  if (grim == null) {
    // eslint-disable-next-line no-console
    console.log('Expected Grim to have been loaded.');
    return 1;
  }
  if (grim.getDeprecationsLength() > 0) {
    grim.logDeprecations();
    return 1;
  }

  return statusCode;
}
