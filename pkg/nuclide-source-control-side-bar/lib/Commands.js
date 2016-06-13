'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Action} from './types';
import type {AppState} from '..';
import type {BookmarkInfo} from '../../nuclide-hg-repository-base/lib/HgService';

import * as ActionType from './ActionType';
import {HgRepositoryClientAsync} from '../../nuclide-hg-repository-client';
import invariant from 'assert';
import {track} from '../../nuclide-analytics';

type dispatchType = (action: Action) => void;
type getStateType = () => AppState;

export default class Commands {
  _dispatch: dispatchType;
  _getState: getStateType;

  constructor(dispatch: dispatchType, getState: getStateType) {
    this._dispatch = dispatch;
    this._getState = getState;

    // Bind to allow methods to be passed as callbacks.
    (this: any).createBookmark = this.createBookmark.bind(this);
    (this: any).deleteBookmark = this.deleteBookmark.bind(this);
    (this: any).renameBookmark = this.renameBookmark.bind(this);
    (this: any).updateToBookmark = this.updateToBookmark.bind(this);
  }

  createBookmark(name: string, repository: atom$Repository): void {
    const repositoryAsync = repository.async;
    if (repositoryAsync.getType() !== 'hg') {
      return;
    }

    // Type was checked with `getType`. Downcast to safely access members with Flow.
    invariant(repositoryAsync instanceof HgRepositoryClientAsync);

    track('scsidebar-create-bookmark');
    repositoryAsync.createBookmark(name);
  }

  deleteBookmark(bookmark: BookmarkInfo, repository: atom$Repository): void {
    const repositoryAsync = repository.async;
    if (repositoryAsync.getType() !== 'hg') {
      return;
    }

    // Type was checked with `getType`. Downcast to safely access members with Flow.
    invariant(repositoryAsync instanceof HgRepositoryClientAsync);

    track('scsidebar-delete-bookmark');
    repositoryAsync.deleteBookmark(bookmark.bookmark);
  }

  renameBookmark(bookmark: BookmarkInfo, nextName: string, repository: atom$Repository): void {
    const repositoryAsync = repository.async;
    if (repositoryAsync.getType() !== 'hg') {
      return;
    }

    // Type was checked with `getType`. Downcast to safely access members with Flow.
    invariant(repositoryAsync instanceof HgRepositoryClientAsync);

    track('scsidebar-rename-bookmark');
    repositoryAsync.renameBookmark(bookmark.bookmark, nextName);
  }

  fetchProjectDirectories(): void {
    this._dispatch({
      payload: {
        projectDirectories: atom.project.getDirectories(),
      },
      type: ActionType.SET_PROJECT_DIRECTORIES,
    });

    this.fetchProjectRepositories();
  }

  fetchProjectRepositories(): void {
    this._dispatch({
      type: ActionType.FETCH_PROJECT_REPOSITORIES,
    });
  }

  updateToBookmark(bookmark: BookmarkInfo, repository: atom$Repository): void {
    track('scsidebar-update-to-bookmark');
    this._dispatch({
      payload: {
        bookmark,
        repository,
      },
      type: ActionType.UPDATE_TO_BOOKMARK,
    });
  }
}
