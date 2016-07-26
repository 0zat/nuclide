'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Action} from '../types/Action';
import type {GadgetsService} from './types';

import {CompositeDisposable} from 'atom';
import Commands from './Commands';
import createGadgetsService from './createGadgetsService';
import createAtomCommands from './createAtomCommands';
import createStateStream from './createStateStream';
import getInitialState from './getInitialState';
import syncAtomCommands from '../../commons-atom/sync-atom-commands';
import {DisposableSubscription} from '../../commons-node/stream';
import {observableFromSubscribeFunction} from '../../commons-node/event';
import Rx from 'rxjs';
import trackActions from './trackActions';

class Activation {
  _disposables: CompositeDisposable;
  commands: Commands;
  _gadgetsService: ?GadgetsService;

  constructor(initialState_: ?Object) {
    let initialState = initialState_;
    initialState = getInitialState();
    const action$: Rx.Subject<Action> = new Rx.Subject();
    const state$ = createStateStream(action$, initialState);
    const commands = this.commands = new Commands(action$, () => state$.getValue());

    const getGadgets = state => state.get('gadgets');
    const gadget$ = state$.map(getGadgets).distinctUntilChanged();

    this._disposables = new CompositeDisposable(
      new DisposableSubscription(action$),

      // Re-render all pane items when (1) new items are added, (2) new gadgets are registered and
      // (3) the active pane item changes.
      new DisposableSubscription(
        observableFromSubscribeFunction(atom.workspace.observePaneItems.bind(atom.workspace))
          .merge(
            observableFromSubscribeFunction(
              atom.workspace.onDidChangeActivePaneItem.bind(atom.workspace),
            ),
          )
          .merge(gadget$)
          .sampleTime(100)
          .subscribe(() => this.commands.renderPaneItems()),
      ),

      // Clean up when pane items are destroyed.
      new DisposableSubscription(
        observableFromSubscribeFunction(atom.workspace.onDidDestroyPaneItem.bind(atom.workspace))
          .subscribe(({item}) => this.commands.cleanUpDestroyedPaneItem(item)),
      ),

      // Keep the atom commands up to date with the registered gadgets.
      syncAtomCommands(
        gadget$.map(gadgetsMap => new Set(gadgetsMap.values())),
        gadget => createAtomCommands(gadget, commands),
      ),

      // Collect some analytics about gadget actions.
      trackActions(action$),

      // Update the expanded Flex scale whenever the user starts dragging a handle. Use the capture
      // phase since resize handles stop propagation of the event during the bubbling phase.
      new DisposableSubscription(
        Rx.Observable.fromEventPattern(
          handler => { document.addEventListener('mousedown', handler, true); },
          handler => { document.removeEventListener('mousedown', handler, true); },
        )
          .filter(event => event.target.nodeName.toLowerCase() === 'atom-pane-resize-handle')
          // Get the models that represent the containers being resized:
          .flatMap(event => {
            const handleElement = event.target;
            return [
              handleElement.previousElementSibling && handleElement.previousElementSibling.model,
              handleElement.nextElementSibling && handleElement.nextElementSibling.model,
            ].filter(paneItemContainer => paneItemContainer !== null);
          })
          // Make sure these are actually pane item containers:
          .filter(paneItemContainer => {
            return ('getItems' in paneItemContainer) && ('getFlexScale' in paneItemContainer);
          })
          .subscribe(paneItemContainer => this.commands.updateExpandedFlexScale(paneItemContainer)),
      ),
    );
  }

  deactivate() {
    this.commands.deactivate();
    this._disposables.dispose();
  }

  provideGadgetsService(): GadgetsService {
    if (this._gadgetsService == null) {
      const {service, dispose} = createGadgetsService(this.commands);
      this._disposables.add({dispose});
      this._gadgetsService = service;
    }
    return this._gadgetsService;
  }

}

module.exports = Activation;
