'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {WorkspaceViewsService} from '../../nuclide-workspace-views/lib/types';

import {viewableFromReactElement} from '../../commons-atom/viewableFromReactElement';
import Inspector from './ui/Inspector';
import invariant from 'assert';
import {CompositeDisposable} from 'atom';
import {React} from 'react-for-atom';

let disposables: ?CompositeDisposable = null;

export function activate(): void {
  disposables = new CompositeDisposable();
}

export function deactivate(): void {
  invariant(disposables != null);
  disposables.dispose();
  disposables = null;
}

export function consumeWorkspaceViewsService(api: WorkspaceViewsService): void {
  invariant(disposables != null);
  disposables.add(
    api.registerFactory({
      id: 'nuclide-react-native-inspector',
      name: 'React Native Inspector',
      toggleCommand: 'nuclide-react-native-inspector:toggle',
      defaultLocation: 'pane',
      create: () => viewableFromReactElement(<Inspector />),
      isInstance: item => item instanceof Inspector,
    }),
  );
}
