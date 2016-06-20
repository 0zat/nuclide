'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import {CompositeDisposable} from 'atom';

import {NuxManager} from '../lib/NuxManager';
import {
  NuxStore,
  NUX_SAVED_STORE,
} from '../lib/NuxStore';

import type {NuxTourModel} from '../lib/NuxModel';

const NUX_TOUR_SPEC_EXAMPLE_NUX = 'nuclide-nux-spec.nux-tour-sample';

describe('NuxTour', () => {
  function generateTestNuxTour(
    id: string,
    numViews: number = 1,
  ): NuxTourModel {
    const nuxViewModel = {
      content: 'Content',
      isCustomContent: false,
      selector: '.something',
      selectorFunction: null,
      position: 'auto',
      completionPredicate: null,
      completed: false,
    };
    return {
      completed: false,
      id,
      nuxList: Array(numViews).fill(nuxViewModel),
      trigger: null,
      gatekeeperID: null,
    };
  }

  let nuxStore;
  let disposables: CompositeDisposable;
  let nuclideNuxState;

  beforeEach(() => {
    disposables = new CompositeDisposable();
    // Save viewed state of NUXes
    nuclideNuxState = window.localStorage.getItem(NUX_SAVED_STORE);
    window.localStorage.clear();

    nuxStore = new NuxStore();
    disposables.add(nuxStore);
  });

  afterEach(() => {
    disposables.dispose();
    // Restore viewed state of NUXes
    window.localStorage.setItem(
      NUX_SAVED_STORE,
      nuclideNuxState,
    );
  });

  it('stores a NuxTour\'s state in the NuxStore', () => {
    nuxStore.addNewNux(generateTestNuxTour('a'));
    nuxStore.addNewNux(generateTestNuxTour('b'));

    expect(nuxStore._nuxMap.size).toBe(2);
  });

  it('creates a NuxTour from a NuxTourModel', () => {
    const nuxManager = new NuxManager(nuxStore);
    disposables.add(nuxManager);

    nuxStore.addNewNux(generateTestNuxTour(NUX_TOUR_SPEC_EXAMPLE_NUX));

    expect(nuxStore._nuxMap.size).toBe(1);
  });

  it('creates a NuxTour that waits for a trigger', () => {
    const nuxManager = new NuxManager(nuxStore);
    disposables.add(nuxManager);

    const nuxTour = generateTestNuxTour(NUX_TOUR_SPEC_EXAMPLE_NUX);
    nuxTour.trigger = {
      triggerType: 'editor',
      triggerCallback: (() => false),
    };
    nuxStore.addNewNux(nuxTour);

    expect(nuxStore._nuxMap.size).toBe(1);
    expect(nuxManager._readyToDisplayNuxes.length).toBe(0);
    expect(nuxManager._pendingNuxes.size).toBe(1);
    expect(nuxManager._activeNuxTour != null).toBeFalsy();
  });
});
