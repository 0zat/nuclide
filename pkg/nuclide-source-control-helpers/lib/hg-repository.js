'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import nuclideUri from '../../nuclide-remote-uri';
import ini from 'ini';
import fsPromise from '../../commons-node/fsPromise';

import type {HgRepositoryDescription} from '..';

/**
 * This function returns HgRepositoryDescription filled with a repoPath and
 * originURL iff it finds that the given directory is within an Hg repository.
 */
function findHgRepository(directoryPath: string): ?HgRepositoryDescription {
  const fs = require('fs-plus');
  let workingDirectoryPath = directoryPath;
  let repoPath = nuclideUri.join(workingDirectoryPath, '.hg');
  let originURL = null;
  for (;;) {
    const dirToTest = nuclideUri.join(workingDirectoryPath, '.hg');
    if (fs.isDirectorySync(dirToTest)) {
      repoPath = dirToTest;
      if (fs.isFileSync(nuclideUri.join(dirToTest, 'hgrc'))) {
        const config = ini.parse(fs.readFileSync(nuclideUri.join(dirToTest, 'hgrc'), 'utf8'));
        if (typeof config.paths === 'object' && typeof config.paths.default === 'string') {
          originURL = config.paths.default;
        }
      }
      break;
    }
    if (isRootDir(workingDirectoryPath)) {
      return null;
    } else {
      workingDirectoryPath = getParentDir(workingDirectoryPath);
    }
  }
  return {repoPath, originURL, workingDirectoryPath};
}

function isRootDir(directoryPath: string): boolean {
  return fsPromise.isRoot(directoryPath);
}

function getParentDir(directoryPath: string): string {
  return nuclideUri.resolve(directoryPath, '..');
}

module.exports = findHgRepository;
