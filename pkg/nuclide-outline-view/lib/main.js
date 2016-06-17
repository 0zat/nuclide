'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {HomeFragments} from '../../nuclide-home/lib/types';
import type {DistractionFreeModeProvider} from '../../nuclide-distraction-free-mode';
import type {GetToolBar} from '../../commons-atom/suda-tool-bar';
import type {Result} from '../../commons-atom/ActiveEditorRegistry';
import type {Observable} from 'rxjs';

import {CompositeDisposable, Disposable} from 'atom';

import ActiveEditorRegistry from '../../commons-atom/ActiveEditorRegistry';
import {track} from '../../nuclide-analytics';

import {OutlineViewPanelState} from './OutlineViewPanel';
import {createOutlines} from './createOutlines';

import invariant from 'assert';

import type {TokenizedText} from '../../nuclide-tokenized-text';

export type OutlineTree = {
  // Must be one or the other. If both are present, tokenizedText is preferred.
  plainText?: string;
  tokenizedText?: TokenizedText;
  representativeName?: string;

  startPosition: atom$Point;
  endPosition?: atom$Point;
  children: Array<OutlineTree>;
};

export type Outline = {
  outlineTrees: Array<OutlineTree>;
};

export type OutlineTreeForUi = {
  plainText?: string;
  tokenizedText?: TokenizedText;

  startPosition: atom$Point;
  endPosition?: atom$Point;
  children: Array<OutlineTreeForUi>;
  highlighted: boolean;
};

/**
 * Includes additional information that is useful to the UI, but redundant or nonsensical for
 * providers to include in their responses.
 */
export type OutlineForUi = {
  // The initial state at startup.
  kind: 'empty';
} | {
  // The thing that currently has focus is not a text editor.
  kind: 'not-text-editor';
} | {
  // Currently awaiting results from a provider (for longer than a certain delay).
  kind: 'loading';
} | {
  // Indicates that no provider is registered for the given grammar.
  kind: 'no-provider';
  // Human-readable name for the grammar.
  grammar: string;
} | {
  // Indicates that a provider is registered but that it did not return an outline.
  kind: 'provider-no-outline';
} | {
  kind: 'outline';
  outlineTrees: Array<OutlineTreeForUi>;
  /**
   * Use a TextEditor instead of a path so that:
   * - If there are multiple editors for a file, we always jump to outline item
   *   locations in the correct editor.
   * - Jumping to outline item locations works for new, unsaved files.
   */
  editor: atom$TextEditor;
};

export type OutlineProvider = {
  name: string;
  // If there are multiple providers for a given grammar, the one with the highest priority will be
  // used.
  priority: number;
  grammarScopes: Array<string>;
  updateOnEdit?: boolean;
  getOutline: (editor: TextEditor) => Promise<?Outline>;
};

type OutlineViewState = {
  width: number;
  visible: boolean;
};

export type ResultsStreamProvider = {
  getResultsStream: () => Observable<Result<OutlineProvider, ?Outline>>;
};

const DEFAULT_WIDTH = 300; // px

function makeDefaultState(): OutlineViewState {
  return {
    width: DEFAULT_WIDTH,
    visible: false,
  };
}

class Activation {
  _disposables: CompositeDisposable;

  _editorService: ActiveEditorRegistry<OutlineProvider, ?Outline>;

  _panel: OutlineViewPanelState;

  constructor(state?: OutlineViewState = makeDefaultState()) {
    this._disposables = new CompositeDisposable();

    this._editorService = new ActiveEditorRegistry(
      (provider, editor) => {
        track('nuclide-outline-view-getoutline');
        return provider.getOutline(editor);
      }
    );

    const panel = this._panel = new OutlineViewPanelState(
      createOutlines(this._editorService),
      state.width,
      state.visible
    );
    this._disposables.add(panel);

    this._disposables.add(
      atom.commands.add(
        'atom-workspace',
        'nuclide-outline-view:toggle',
        panel.toggle.bind(panel),
      )
    );
    this._disposables.add(
      atom.commands.add(
        'atom-workspace',
        'nuclide-outline-view:show',
        panel.show.bind(panel),
      )
    );
    this._disposables.add(
      atom.commands.add(
        'atom-workspace',
        'nuclide-outline-view:hide',
        panel.hide.bind(panel),
      )
    );
  }

  dispose() {
    this._disposables.dispose();
  }

  serialize(): OutlineViewState {
    return {
      visible: this._panel.isVisible(),
      width: this._panel.getWidth(),
    };
  }

  consumeOutlineProvider(provider: OutlineProvider): IDisposable {
    return this._editorService.consumeProvider(provider);
  }

  consumeToolBar(getToolBar: GetToolBar): void {
    const toolBar = getToolBar('nuclide-outline-view');
    const toolBarButtonView = toolBar.addButton({
      icon: 'list-unordered',
      callback: 'nuclide-outline-view:toggle',
      tooltip: 'Toggle Outline View',
      priority: 350, // Between diff view and test runner
    });
    // Class added is not defined elsewhere, and is just used to mark the toolbar button
    toolBarButtonView.element.classList.add('nuclide-outline-view-toolbar-button');
    this._disposables.add(new Disposable(() => {
      toolBar.removeItems();
    }));
  }

  getDistractionFreeModeProvider(): DistractionFreeModeProvider {
    const panel = this._panel;
    return {
      name: 'nuclide-outline-view',
      isVisible: panel.isVisible.bind(panel),
      toggle: panel.toggle.bind(panel),
    };
  }

  getOutlineViewResultsStream(): ResultsStreamProvider {
    return {
      getResultsStream: () => this._editorService.getResultsStream(),
    };
  }
}

let activation: ?Activation = null;

export function activate(state: Object | void) {
  if (activation == null) {
    activation = new Activation(state);
  }
}

export function deactivate() {
  if (activation != null) {
    activation.dispose();
    activation = null;
  }
}

export function serialize(): ?OutlineViewState {
  if (activation != null) {
    return activation.serialize();
  }
}

export function consumeOutlineProvider(provider: OutlineProvider): IDisposable {
  invariant(activation != null);
  return activation.consumeOutlineProvider(provider);
}

export function consumeToolBar(getToolBar: (group: string) => Object): void {
  invariant(activation != null);
  activation.consumeToolBar(getToolBar);
}

export function getHomeFragments(): HomeFragments {
  return {
    feature: {
      title: 'Outline View',
      icon: 'list-unordered',
      description: 'Displays major components of the current file (classes, methods, etc.)',
      command: 'nuclide-outline-view:show',
    },
    priority: 2.5, // Between diff view and test runner
  };
}

export function getDistractionFreeModeProvider(): DistractionFreeModeProvider {
  invariant(activation != null);
  return activation.getDistractionFreeModeProvider();
}

export function getOutlineViewResultsStream(): ResultsStreamProvider {
  invariant(activation != null);
  return activation.getOutlineViewResultsStream();
}
