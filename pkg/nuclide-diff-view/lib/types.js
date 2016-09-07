'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {NuclideUri} from '../../commons-node/nuclideUri';
import type {RevisionInfo} from '../../nuclide-hg-rpc/lib/HgService';

import {React} from 'react-for-atom';

export type DiffModeType = '1. Browse' | '2. Commit' | '3. Publish';

export type CommitModeType = 'Commit' | 'Amend';

export type CommitModeStateType = 'Ready' | 'Loading Commit Message' | 'Awaiting Commit';

export type PublishModeType = 'Create' | 'Update';

export type PublishModeStateType =
  'Ready'
  | 'Loading Publish Message'
  | 'Awaiting Publish'
  | 'Publish Error'
;

export type DiffOptionType = 'Dirty' | 'Last Commit' | 'Compare Commit';

export type FileChangeStatusValue = 1 | 2 | 3 | 4 | 5;

export type FileChange = {
  filePath: NuclideUri,
  statusCode?: FileChangeStatusValue,
};

export type DiffStatusDisplay = {
  name: string,
  className: ?string,
};

export type RevisionsState = {
  headToForkBaseRevisions: Array<RevisionInfo>,
  compareCommitId: ?number,
  headCommitId: number,
  diffStatuses: Map<number, DiffStatusDisplay>,
  revisions: Array<RevisionInfo>,
};

export type OffsetMap = Map<number, number>;

export type TextDiff = {
  addedLines: Array<number>,
  removedLines: Array<number>,
  oldLineOffsets: OffsetMap,
  newLineOffsets: OffsetMap,
};

export type HgDiffState = {
  revisionInfo: RevisionInfo,
  committedContents: string,
};

export type HighlightedLines = {
  added: Array<number>,
  removed: Array<number>,
};

export type DiffSectionStatusType = 'Added' | 'Changed' | 'Removed';

export type DiffSection = {
  lineCount: number,
  lineNumber: number,
  offsetLineNumber: number,
  status: DiffSectionStatusType,
};

export type UIElement = {
  node: React.Element<any>,
  bufferRow: number,
};

export type UIProvider = {
  composeUiElements: (filePath: string) => Promise<Array<UIElement>>,
};
