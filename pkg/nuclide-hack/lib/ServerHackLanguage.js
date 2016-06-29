'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {NuclideUri} from '../../nuclide-remote-uri';
import type {CompletionResult, DefinitionResult, Definition} from './HackLanguage';
import type {
  HackCompletion,
  HackDiagnostic,
  HackDefinitionResult,
  HackSearchPosition,
  HackRange,
  HackReference,
  HackIdeOutline,
  HackDefinition,
} from '../../nuclide-hack-base/lib/HackService';
import typeof * as HackService from '../../nuclide-hack-base/lib/HackService';
import type {HackCoverageResult} from './TypedRegions';

import {Range} from 'atom';
import {getLogger} from '../../nuclide-logging';
import {convertTypedRegionsToCoverageResult} from './TypedRegions';
import invariant from 'assert';

/**
 * Serves language requests from HackService.
 * Note that all line/column values are 1 based.
 */
export class ServerHackLanguage {

  _hackService: HackService;
  _hhAvailable: boolean;
  _basePath: ?string;

  /**
   * `basePath` should be the directory where the .hhconfig file is located.
   */
  constructor(hackService: HackService, hhAvailable: boolean, basePath: ?string) {
    this._hackService = hackService;
    this._hhAvailable = hhAvailable;
    this._basePath = basePath;
  }

  dispose() {
  }

  async getCompletions(
    filePath: NuclideUri,
    contents: string,
    offset: number,
  ): Promise<Array<CompletionResult>> {
    const markedContents = markFileForCompletion(contents, offset);
    let completions = [];
    const completionsResult = await this._hackService.getCompletions(filePath, markedContents);
    if (completionsResult) {
      completions = completionsResult.completions;
    }
    return processCompletions(completions);
  }

  async formatSource(
    contents: string,
    startPosition: number,
    endPosition: number,
  ): Promise<string> {
    const path = this._basePath;
    if (path == null) {
      throw new Error('No Hack provider for this file.');
    }
    const response =
      await this._hackService.formatSource(path, contents, startPosition, endPosition);
    if (response == null) {
      throw new Error('Error formatting hack source.');
    } else if (response.error_message !== '') {
      throw new Error(`Error formatting hack source: ${response.error_message}`);
    }
    return response.result;
  }

  async highlightSource(
    filePath: NuclideUri,
    contents: string,
    line: number,
    col: number,
  ): Promise<Array<atom$Range>> {
    const response = await this._hackService.getSourceHighlights(filePath, contents, line, col);
    if (response == null) {
      return [];
    }
    return response.positions.map(hackRangeToAtomRange);
  }

  async getDiagnostics(
    filePath: NuclideUri,
    contents: string,
  ): Promise<Array<{message: HackDiagnostic;}>> {
    let diagnosticResult = null;
    try {
      diagnosticResult = await this._hackService.getDiagnostics(filePath, contents);
    } catch (err) {
      getLogger().error(err);
      return [];
    }
    if (!diagnosticResult) {
      getLogger().error('hh_client could not be reached');
      return [];
    }
    const hackDiagnostics = diagnosticResult;
    return hackDiagnostics.messages;
  }

  async getTypeCoverage(
    filePath: NuclideUri,
  ): Promise<?HackCoverageResult> {
    const regions = await this._hackService.getTypedRegions(filePath);
    return convertTypedRegionsToCoverageResult(regions);
  }

  getIdeOutline(
    filePath: NuclideUri,
    contents: string,
  ): Promise<?HackIdeOutline> {
    return this._hackService.getIdeOutline(filePath, contents);
  }

  async getDefinition(
    filePath: NuclideUri,
    contents: string,
    lineNumber: number,
    column: number,
    lineText: string,
  ): Promise<Array<DefinitionResult>> {
    const definitionResult = await this._hackService.getIdentifierDefinition(
      filePath, contents, lineNumber, column
    );
    const identifierResult = processDefinitionsForXhp(definitionResult, column, lineText);
    return identifierResult.length === 1 ? identifierResult : [];
  }

  async getIdeDefinition(
    filePath: NuclideUri,
    contents: string,
    lineNumber: number,
    column: number,
  ): Promise<Array<Definition>> {
    const definitions =
      await this._hackService.getDefinition(filePath, contents, lineNumber, column);
    if (definitions == null) {
      return [];
    }
    function convertDefinition(def: HackDefinition): Definition {
      invariant(def.definition_pos != null);
      return {
        name: def.name,
        path: def.definition_pos.filename,
        line: def.definition_pos.line,
        column: def.definition_pos.char_start,
        queryRange: hackRangeToAtomRange(def.pos),
      };
    }
    return definitions.filter(definition => definition.definition_pos != null)
      .map(convertDefinition);
  }

  async getType(
    filePath: NuclideUri,
    contents: string,
    expression: string,
    lineNumber: number,
    column: number,
  ): Promise<?string> {
    if (!expression.startsWith('$')) {
      return null;
    }
    const result = await this._hackService.getTypeAtPos(filePath, contents, lineNumber, column);
    return result == null ? null : result.type;
  }

  async findReferences(
    filePath: NuclideUri,
    contents: string,
    line: number,
    column: number,
  ): Promise<?{baseUri: string; symbolName: string; references: Array<HackReference>}> {
    const referencesResult =
      await this._hackService.findReferences(filePath, contents, line, column);
    if (!referencesResult) {
      return null;
    }
    const {hackRoot, references} = referencesResult;
    if (references == null || references.length === 0) {
      return null;
    }
    return {baseUri: hackRoot, symbolName: references[0].name, references};
  }

  getBasePath(): ?string {
    return this._basePath;
  }

  isHackAvailable(): boolean {
    return this._hhAvailable;
  }
}

function hackRangeToAtomRange(position: HackRange): atom$Range {
  return new Range(
        [position.line - 1, position.char_start - 1],
        [position.line - 1, position.char_end],
      );
}

// The xhp char regex include : and - to match xhp tags like <ui:button-group>.
const xhpCharRegex = /[\w:-]/;

function processCompletions(completionsResponse: Array<HackCompletion>):
    Array<CompletionResult> {
  return completionsResponse.map(completion => {
    const {name, func_details: functionDetails} = completion;
    let {type} = completion;
    if (type && type.indexOf('(') === 0 && type.lastIndexOf(')') === type.length - 1) {
      type = type.substring(1, type.length - 1);
    }
    let matchSnippet = name;
    if (functionDetails) {
      const {params} = functionDetails;
      // Construct the snippet: e.g. myFunction(${1:$arg1}, ${2:$arg2});
      const paramsString = params.map(
        (param, index) => '${' + (index + 1) + ':' + param.name + '}').join(', ');
      matchSnippet = name + '(' + paramsString + ')';
    }
    return {
      matchSnippet,
      matchText: name,
      matchType: type,
    };
  });
}

// Calculate the offset of the cursor from the beginning of the file.
// Then insert AUTO332 in at this offset. (Hack uses this as a marker.)
function markFileForCompletion(contents: string, offset: number): string {
  return contents.substring(0, offset) +
      'AUTO332' + contents.substring(offset, contents.length);
}

function processDefinitionsForXhp(
  definitionResult: ?HackDefinitionResult,
  column: number,
  lineText: string,
): Array<DefinitionResult> {
  if (!definitionResult) {
    return [];
  }
  const {definitions} = definitionResult;
  return definitions.map((definition: HackSearchPosition) => {
    let {name} = definition;
    if (name.startsWith(':')) {
      // XHP class name, usages omit the leading ':'.
      name = name.substring(1);
    }
    const definitionIndex = lineText.indexOf(name);
    if (
      definitionIndex === -1 ||
      definitionIndex >= column ||
      !xhpCharRegex.test(lineText.substring(definitionIndex, column))
    ) {
      return {...definition};
    } else {
      return {
        ...definition,
        searchStartColumn: definitionIndex,
        searchEndColumn: definitionIndex + definition.name.length,
      };
    }
  });
}
