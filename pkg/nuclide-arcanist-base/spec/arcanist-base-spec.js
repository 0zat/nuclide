'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import * as arcanist from '..';
import nuclideUri from '../../nuclide-remote-uri';
import fs from 'fs-plus';
import temp from 'temp';
import invariant from 'assert';
import {uncachedRequire} from '../../nuclide-test-helpers';

temp.track();

const rootConfig = {
  project_id: 'project1',
};
const nestedConfig = {
  project_id: 'project-nested',
};

describe('nuclide-arcanist-base', () => {
  let rootPath: any;
  let dirPath: any;
  let file1Path: any;
  let file2Path: any;
  let nestedPath: any;
  let tempPath: any;

  beforeEach(() => {
    waitsForPromise(async () => {
      // Copy the contents of 'fixtures' into a temp directory
      // ... and rename any .arcconfig.test -> .arcconfig
      tempPath = fs.absolute(temp.mkdirSync());
      const fixturesPath = nuclideUri.join(__dirname, 'fixtures');
      fs.copySync(fixturesPath, tempPath);

      function adjustArcConfig(dir: string) {
        fs.renameSync(
          nuclideUri.join(dir, '.arcconfig.test'),
          nuclideUri.join(dir, '.arcconfig'));
      }

      adjustArcConfig(nuclideUri.join(tempPath, 'arc'));
      adjustArcConfig(nuclideUri.join(tempPath, 'arc', 'nested-project'));

      rootPath = nuclideUri.join(tempPath, 'arc');
      dirPath = nuclideUri.join(rootPath, 'dir1');
      file1Path = nuclideUri.join(dirPath, 'file1');
      file2Path = nuclideUri.join(rootPath, 'file2');
      nestedPath = nuclideUri.join(rootPath, 'nested-project');
    });
  });

  afterEach(() => {
    temp.cleanupSync();
  });

  it('findArcConfigDirectory', () => {
    waitsForPromise(async () => {
      expect(await arcanist.findArcConfigDirectory(rootPath)).toBe(rootPath);
      expect(await arcanist.findArcConfigDirectory(dirPath)).toBe(rootPath);
      expect(await arcanist.findArcConfigDirectory(file1Path)).toBe(rootPath);
      expect(await arcanist.findArcConfigDirectory(file2Path)).toBe(rootPath);
      expect(await arcanist.findArcConfigDirectory(nestedPath)).toBe(nestedPath);
      expect(await arcanist.findArcConfigDirectory(tempPath)).toBe(null);
    });
  });

  it('readArcConfig', () => {
    waitsForPromise(async () => {
      expect(await arcanist.readArcConfig(rootPath)).toEqual(rootConfig);
      expect(await arcanist.readArcConfig(dirPath)).toEqual(rootConfig);
      expect(await arcanist.readArcConfig(file1Path)).toEqual(rootConfig);
      expect(await arcanist.readArcConfig(file2Path)).toEqual(rootConfig);
      expect(await arcanist.readArcConfig(nestedPath)).toEqual(nestedConfig);
      expect(await arcanist.readArcConfig(tempPath)).toEqual(null);
    });
  });

  it('findArcProjectIdOfPath', () => {
    waitsForPromise(async () => {
      expect(await arcanist.findArcProjectIdOfPath(rootPath)).toBe('project1');
      expect(await arcanist.findArcProjectIdOfPath(dirPath)).toBe('project1');
      expect(await arcanist.findArcProjectIdOfPath(file1Path)).toBe('project1');
      expect(await arcanist.findArcProjectIdOfPath(file2Path)).toBe('project1');
      expect(await arcanist.findArcProjectIdOfPath(nestedPath)).toBe('project-nested');
      expect(await arcanist.findArcProjectIdOfPath(tempPath)).toBe(null);
    });
  });

  it('getProjectRelativePath', () => {
    waitsForPromise(async () => {
      expect(await arcanist.getProjectRelativePath(rootPath)).toBe('');
      expect(await arcanist.getProjectRelativePath(dirPath)).toBe('dir1');
      expect(await arcanist.getProjectRelativePath(file1Path)).toBe('dir1/file1');
      expect(await arcanist.getProjectRelativePath(file2Path)).toBe('file2');
      expect(await arcanist.getProjectRelativePath(nestedPath)).toBe('');
      expect(await arcanist.getProjectRelativePath(tempPath)).toBe(null);
    });
  });

  describe('findDiagnostics', () => {
    // Map from fake arc config dir to fake files within it.
    const filePathMap: Map<string, Array<string>> = new Map([
      ['/fake/path/one', [
        'path1',
        'path2',
        '/fake/path/one/path1',
      ]],
      ['/fake/path/two', [
        'foo',
        'bar',
      ]],
    ]);
    let arcResult: any;
    let execArgs: any;
    let arcanistBaseService: any;
    const fakeLint = {
      description: 'Trailing spaces not allowed. (no-trailing-spaces)',
      severity: 'warning',
      original: '  ',
      line: 78,
      bypassChangedLineFiltering: null,
      name: 'ESLint reported a warning.',
      granularity: 1,
      locations: [],
      replacement: '',
      code: 'FBNUCLIDELINT1',
      char: 2,
      context: 'this usually contains some nearby code',
    };
    const fakeLintResult = {
      type: 'Warning',
      text: 'Trailing spaces not allowed. (no-trailing-spaces)',
      filePath: '/fake/path/one/path1',
      row: 77,
      col: 1,
      code: 'FBNUCLIDELINT1',
      original: '  ',
      replacement: '',
    };

    function setResult(...results) {
      // This mimics the output that `arc lint` can provide. Sometimes it provides results as valid
      // JSON objects separated by a newline. The result is not valid JSON but it's what we get.
      arcResult = {stdout: results.map(result => JSON.stringify(result)).join('\n')};
    }

    beforeEach(() => {
      setResult({});
      execArgs = [];
      spyOn(require('../../commons-node/process'), 'checkOutput')
        .andCallFake((command, args, options) => {
          execArgs.push(args);
          return arcResult;
        }
      );
      arcanistBaseService = (uncachedRequire(require, '../lib/ArcanistBaseService'): any);
      // Add these paths to the arcConfigDirectoryMap as a roundabout way to mock
      // findArcConfigDirectory.
      for (const [arcDir, filePaths] of filePathMap) {
        for (const filePath of filePaths) {
          arcanistBaseService.arcConfigDirectoryMap.set(filePath, arcDir);
        }
      }
    });

    it('should call `arc lint` with the paths', () => {
      waitsForPromise(async () => {
        const filePaths = filePathMap.get('/fake/path/one');
        invariant(filePaths != null);
        expect(filePaths.length).toBe(3);
        await arcanistBaseService.findDiagnostics(filePaths, []);
        // Expect arc lint to be called once
        expect(execArgs.length).toBe(1);
        for (const filePath of filePaths) {
          expect(execArgs[0].indexOf(filePath)).toBeGreaterThan(-1);
        }
      });
    });

    it('should call `arc lint` separately for paths in different arc config dirs', () => {
      waitsForPromise(async () => {
        const filePaths = ['path1', 'foo'];
        await arcanistBaseService.findDiagnostics(filePaths, []);
        // Expect arc lint to be called twice.
        expect(execArgs.length).toBe(2);
        let path1Args;
        let fooArgs;
        if (execArgs[0].indexOf('path1') !== -1) {
          [path1Args, fooArgs] = execArgs;
        } else {
          [fooArgs, path1Args] = execArgs;
        }
        expect(path1Args.indexOf('path1')).toBeGreaterThan(-1);
        expect(fooArgs.indexOf('foo')).toBeGreaterThan(-1);
      });
    });

    it('should return the lints', () => {
      waitsForPromise(async () => {
        setResult({
          path1: [fakeLint],
        });
        const lints = await arcanistBaseService.findDiagnostics(['/fake/path/one/path1'], []);
        expect(lints).toEqual([fakeLintResult]);
      });
    });

    it('should return the lints even when they are in separate JSON objects', () => {
      waitsForPromise(async () => {
        const fakeArcResult = {path1: [fakeLint]};
        setResult(fakeArcResult, fakeArcResult);
        const lints = await arcanistBaseService.findDiagnostics(['/fake/path/one/path1'], []);
        expect(lints).toEqual([fakeLintResult, fakeLintResult]);
      });
    });
  });
});
