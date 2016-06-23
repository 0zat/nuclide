'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import * as pathSearch from '../../nuclide-path-search';
import {
  queryFuzzyFile,
  isFuzzySearchAvailableFor,
} from '..';

// $FlowIgnore #yolo
pathSearch.fileSearchForDirectory = () => {
  return Promise.resolve({
    query() {
      return Promise.resolve([]);
    },
    dispose() {},
  });
};

describe('FuzzyFileSearchService.isFuzzySearchAvailableFor', () => {
  it('can search existing directories', () => {
    waitsForPromise(async () => {
      expect(await isFuzzySearchAvailableFor(__dirname)).toBe(true);
    });
  });

  it('cant search non-existing directories', () => {
    waitsForPromise(async () => {
      const nonExistentPath = __dirname + 'xxx'; //eslint-disable-line no-path-concat
      expect(await isFuzzySearchAvailableFor(nonExistentPath)).toBe(false);
    });
  });

  it('doesnt get confused by atom:// paths', () => {
    waitsForPromise(async () => {
      expect(await isFuzzySearchAvailableFor('atom://about')).toBe(false);
    });
  });
});

describe('FuzzyFileSearchService.queryFuzzyFile', () => {
  it('finds a file in a directory that exists', () => {
    waitsForPromise(async () => {
      // This test can't actually perform a search because path-search
      // uses watchman and we don't have a good way to mock dependencies.
      const fileSearchResults = await queryFuzzyFile(__dirname, 'anything', []);
      expect(fileSearchResults).toEqual([]);
    });
  });
});
