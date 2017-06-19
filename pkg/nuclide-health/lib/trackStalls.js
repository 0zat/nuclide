/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 * @format
 */

import invariant from 'assert';
import {remote} from 'electron';
import {getLogger} from 'log4js';

import UniversalDisposable from 'nuclide-commons/UniversalDisposable';
import {HistogramTracker} from '../../nuclide-analytics';

invariant(remote != null);

// The startup period naturally causes many event loop blockages.
// Don't start checking blockages until some time has passed.
const BLOCKED_GRACE_PERIOD = 30000;
// Report all blockages over this threshold.
const BLOCKED_MIN = 100;
// Discard overly long blockages as spurious (e.g. computer was asleep)
const BLOCKED_MAX = 600000;
// Block checking interval.
const BLOCKED_INTERVAL = 100;

export default function trackStalls(): IDisposable {
  const disposables = new UniversalDisposable();

  let blockedDelay = setTimeout(() => {
    disposables.add(trackStallsImpl());
    blockedDelay = null;
  }, BLOCKED_GRACE_PERIOD);

  disposables.add(() => {
    if (blockedDelay != null) {
      clearTimeout(blockedDelay);
    }
  });

  return disposables;
}

function trackStallsImpl(): IDisposable {
  const browserWindow = remote.getCurrentWindow();
  const histogram = new HistogramTracker(
    'event-loop-blocked',
    /* max */ 1000,
    /* buckets */ 10,
  );

  let intentionalBlockTime = 0;
  const onIntentionalBlock = () => {
    intentionalBlockTime = Date.now();
  };

  // Electron context menus block the event loop.
  browserWindow.on('context-menu', onIntentionalBlock);

  let blockedInterval = null;
  function startBlockedCheck() {
    if (blockedInterval != null) {
      return;
    }
    let lastTime = Date.now();
    blockedInterval = setInterval(() => {
      const now = Date.now();
      if (
        document.hasFocus() &&
        lastTime - intentionalBlockTime > BLOCKED_INTERVAL
      ) {
        const delta = now - lastTime - BLOCKED_INTERVAL;
        if (delta > BLOCKED_MIN && delta < BLOCKED_MAX) {
          histogram.track(delta);
          getLogger('nuclide-health').warn(
            `Event loop was blocked for ${delta} ms`,
          );
        }
      }
      lastTime = now;
    }, BLOCKED_INTERVAL);
  }

  function stopBlockedCheck() {
    if (blockedInterval != null) {
      clearInterval(blockedInterval);
      blockedInterval = null;
    }
  }

  if (document.hasFocus()) {
    startBlockedCheck();
  }
  browserWindow.on('focus', startBlockedCheck);
  browserWindow.on('blur', stopBlockedCheck);

  return new UniversalDisposable(
    histogram,
    // Confirmation dialogs also block the event loop.
    // This typically happens when you're about to close an unsaved file.
    atom.workspace.onWillDestroyPaneItem(onIntentionalBlock),
    () => {
      stopBlockedCheck();
      browserWindow.removeListener('focus', startBlockedCheck);
      browserWindow.removeListener('blur', stopBlockedCheck);
      browserWindow.removeListener('context-menu', onIntentionalBlock);
    },
  );
}
