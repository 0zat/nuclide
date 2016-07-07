'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import typeof * as ServerHackLanguageType from '../lib/ServerHackLanguage';
import type {ServerHackLanguage} from '../lib/ServerHackLanguage';
import type {
  HackCompletionsResult,
  HackDiagnosticsResult,
  HackTypedRegion,
  HackTypeAtPosResult,
  HackFindLvarRefsResult,
  HackFormatSourceResult,
  HackReferencesResult,
} from '../../nuclide-hack-base/lib/HackService';

import {uncachedRequire, clearRequireCache} from '../../nuclide-test-helpers';

const basePath = '/tmp/project';
const filePath = '/tmp/project/file.hh';
const contents = `<?hh // strict
class HackClass {}`;
const contents2 = `<?hh // strict
fclass HackClass {}`;
const contents3 = `<?hh // strict
HH\\fclass HackClass {}`;

describe('ServerHackLanguage', () => {
  let mockService: Object = (null: any);
  let hackLanguage: ServerHackLanguage = (null: any);

  // Tests ToBeTested.functionToTest while mocking imported function toBeMocked.
  beforeEach(() => {

    mockService = jasmine.createSpyObj('HackService', [
      'getCompletions',
      'getDiagnostics',
      'getIdentifierDefinition',
      'getDefinition',
      'getTypedRegions',
      'getTypeAtPos',
      'getSourceHighlights',
      'formatSource',
      'getMethodName',
      'findReferences',
    ]);

    const ServerHackLanguageCtor =
      ((uncachedRequire(require, '../lib/ServerHackLanguage'): any): ServerHackLanguageType)
        .ServerHackLanguage;
    hackLanguage = new ServerHackLanguageCtor((mockService: any), true, basePath);
  });

  it('isHackAvailable', () => {
    expect(hackLanguage.isHackAvailable()).toEqual(true);
  });

  it('getBasePath', () => {
    expect(hackLanguage.getBasePath()).toEqual(basePath);
  });

  it('getCompletions', () => {
    waitsForPromise(async () => {
      const serviceResults: HackCompletionsResult = {
        hackRoot: basePath,
        completions: [
          {
            name: 'foo',
            func_details: {
              params: [
                {
                  name: 'p1',
                },
                {
                  name: 'p2',
                },
              ],
            },
            type: 'foo_type',
            pos: {
              filename: filePath,
              line: 42,
              char_start: 0,
              char_end: 10,
            },
          },
        ],
      };
      mockService.getCompletions.andReturn(serviceResults);

      const result = await hackLanguage.getCompletions(filePath, contents2, 16);

      expect(mockService.getCompletions).toHaveBeenCalledWith(filePath, `<?hh // strict
fAUTO332class HackClass {}`);
      expect(result).toEqual([
        {
          matchSnippet: 'foo(${1:p1}, ${2:p2})',
          matchText: 'foo',
          matchType: 'foo_type',
          prefix: 'f',
        },
      ]);
    });
  });

  it('getCompletions - escaping', () => {
    waitsForPromise(async () => {
      const serviceResults: HackCompletionsResult = {
        hackRoot: basePath,
        completions: [
          {
            name: 'HH\\foo',
            func_details: {
              params: [
                {
                  name: 'p1',
                },
                {
                  name: 'p2',
                },
              ],
            },
            type: 'foo_type',
            pos: {
              filename: filePath,
              line: 42,
              char_start: 0,
              char_end: 10,
            },
          },
        ],
      };
      mockService.getCompletions.andReturn(serviceResults);

      const result = await hackLanguage.getCompletions(filePath, contents3, 19);

      expect(mockService.getCompletions).toHaveBeenCalledWith(filePath, `<?hh // strict
HH\\fAUTO332class HackClass {}`);
      expect(result).toEqual([
        {
          matchSnippet: 'HH\\\\foo(${1:p1}, ${2:p2})',
          matchText: 'HH\\foo',
          matchType: 'foo_type',
          prefix: 'HH\\f',
        },
      ]);
    });
  });

  it('formatSource', () => {
    waitsForPromise(async () => {
      const serviceResult: HackFormatSourceResult = {
        error_message: '',
        result: 'format-result',
        internal_error: false,
      };
      mockService.formatSource.andReturn(serviceResult);

      const result = await hackLanguage.formatSource(contents, 0, contents.length);

      expect(mockService.formatSource).toHaveBeenCalledWith(basePath, contents, 0, contents.length);
      expect(result).toEqual(serviceResult.result);
    });
  });

  it('highlightSource', () => {
    waitsForPromise(async () => {
      const serviceResults: HackFindLvarRefsResult = {
        positions: [
          {
            filename: filePath,
            line: 1,
            char_start: 2,
            char_end: 2,
          },
          {
            filename: filePath,
            line: 2,
            char_start: 4,
            char_end: 6,
          },
        ],
        internal_error: false,
      };
      mockService.getSourceHighlights.andReturn(serviceResults);

      const result = await hackLanguage.highlightSource(filePath, contents, 4, 6);

      expect(mockService.getSourceHighlights).toHaveBeenCalledWith(filePath, contents, 4, 6);
      expect(result).toEqual([
        {start: {row: 0, column: 1}, end: {row: 0, column: 2}},
        {start: {row: 1, column: 3}, end: {row: 1, column: 6}},
      ]);
    });
  });

  it('getDiagnostics', () => {
    waitsForPromise(async () => {
      const message = {
        message: [
          {
            path: filePath,
            descr: 'Diagnostic description',
            code: 42,
            line: 12,
            start: 4,
            end: 8,
          },
        ],
      };
      const serviceResults: HackDiagnosticsResult = {
        hackRoot: basePath,
        messages: [
          message,
        ],
      };

      mockService.getDiagnostics.andReturn(serviceResults);

      const result = await hackLanguage.getDiagnostics(filePath, contents);
      expect(mockService.getDiagnostics).toHaveBeenCalledWith(filePath, contents);
      expect(result).toEqual([message]);
    });
  });

  it('getTypeCoverage', () => {
    waitsForPromise(async () => {
      const serviceResults: Array<HackTypedRegion> = [
        {color: 'default', text: '123'},
        {color: 'unchecked', text: '456'},
      ];
      mockService.getTypedRegions.andReturn(serviceResults);

      const result = await hackLanguage.getTypeCoverage(filePath);

      expect(mockService.getTypedRegions).toHaveBeenCalledWith(filePath);
      expect(result).toEqual({
        percentage: 0,
        uncoveredRegions: [{type: 'unchecked', line: 1, start: 4, end: 6}],
      });
    });
  });

  it('getIdeDefinition - no results', () => {
    waitsForPromise(async () => {
      const definitions = [];
      mockService.getDefinition.andReturn(definitions);

      const result = await hackLanguage.getIdeDefinition(filePath, contents, 1, 2, 'howdy');

      expect(mockService.getDefinition).toHaveBeenCalledWith(filePath, contents, 1, 2);
      expect(result).toEqual([]);
    });
  });

  it('getIdeDefinition - result with no definition', () => {
    waitsForPromise(async () => {
      const definitions = [{
        definition_pos: null,
        name: 'heyheyhey',
        pos: {
          filename: filePath,
          line: 1,
          char_start: 1,
          char_end: 3,
        },
      }];
      mockService.getDefinition.andReturn(definitions);

      const result = await hackLanguage.getIdeDefinition(filePath, contents, 1, 2, 'howdy');

      expect(mockService.getDefinition).toHaveBeenCalledWith(filePath, contents, 1, 2);
      expect(result).toEqual([]);
    });
  });

  it('getIdeDefinition - result with definition', () => {
    waitsForPromise(async () => {
      const definitions = [{
        definition_pos: {
          filename: filePath,
          line: 42,
          char_start: 12,
          char_end: 13,
        },
        name: 'heyheyhey',
        pos: {
          filename: filePath,
          line: 1,
          char_start: 1,
          char_end: 3,
        },
      }];
      mockService.getDefinition.andReturn(definitions);

      const result = await hackLanguage.getIdeDefinition(filePath, contents, 1, 2, 'howdy');

      expect(mockService.getDefinition).toHaveBeenCalledWith(filePath, contents, 1, 2);
      expect(result).toEqual([{
        name: 'heyheyhey',
        path: filePath,
        line: 42,
        column: 12,
        queryRange: {
          start: {
            row: 0,
            column: 0,
          },
          end: {
            row: 0,
            column: 3,
          },
        },
      }]);
    });
  });

  it('getIdeDefinition - multiple results', () => {
    waitsForPromise(async () => {
      const definitions = [
        {
          definition_pos: {
            filename: filePath,
            line: 42,
            char_start: 12,
            char_end: 13,
          },
          name: 'heyheyhey',
          pos: {
            filename: filePath,
            line: 1,
            char_start: 1,
            char_end: 3,
          },
        },
        {
          definition_pos: {
            filename: filePath,
            line: 142,
            char_start: 121,
            char_end: 131,
          },
          name: 'heyheyhey::__construct',
          pos: {
            filename: filePath,
            line: 1,
            char_start: 1,
            char_end: 3,
          },
        },
      ];
      mockService.getDefinition.andReturn(definitions);

      const result = await hackLanguage.getIdeDefinition(filePath, contents, 1, 2, 'howdy');

      expect(mockService.getDefinition).toHaveBeenCalledWith(filePath, contents, 1, 2);
      expect(result).toEqual([
        {
          name: 'heyheyhey',
          path: filePath,
          line: 42,
          column: 12,
          queryRange: {
            start: {
              row: 0,
              column: 0,
            },
            end: {
              row: 0,
              column: 3,
            },
          },
        },
        {
          name: 'heyheyhey::__construct',
          path: filePath,
          line: 142,
          column: 121,
          queryRange: {
            start: {
              row: 0,
              column: 0,
            },
            end: {
              row: 0,
              column: 3,
            },
          },
        },
      ]);
    });
  });

  it('getType', () => {
    waitsForPromise(async () => {
      const serviceResult: HackTypeAtPosResult = {
        type: 'hack-type',
        pos: {
          filename: filePath,
          line: 1,
          char_start: 2,
          char_end: 2,
        },
      };
      mockService.getTypeAtPos.andReturn(serviceResult);

      const result = await hackLanguage.getType(filePath, contents, '$expr', 1, 2);

      expect(mockService.getTypeAtPos).toHaveBeenCalledWith(filePath, contents, 1, 2);
      expect(result).toEqual(serviceResult.type);
    });
  });

  it('findReferences', () => {
    waitsForPromise(async () => {
      const findResult: HackReferencesResult = {
        hackRoot: basePath,
        references: [
          {
            name: 'item_name',
            filename: filePath,
            line: 1,
            char_start: 2,
            char_end: 3,
          },
          {
            name: 'item_name',
            filename: filePath,
            line: 11,
            char_start: 4,
            char_end: 7,
          },
        ],
      };
      mockService.findReferences.andReturn(findResult);

      const result = await hackLanguage.findReferences(filePath, contents, 2, 3);

      expect(result).toEqual(
        {
          baseUri: '/tmp/project',
          symbolName: 'item_name',
          references: [
            {
              name: 'item_name',
              filename: filePath,
              line: 1,
              char_start: 2,
              char_end: 3,
            },
            {
              name: 'item_name',
              filename: filePath,
              line: 11,
              char_start: 4,
              char_end: 7,
            },
          ],
        });
      expect(mockService.findReferences).toHaveBeenCalledWith(filePath, contents, 2, 3);
    });
  });

  afterEach(() => {
    clearRequireCache(require, '../lib/ServerHackLanguage');
  });
});
