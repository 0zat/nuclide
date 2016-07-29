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
import type {
  nuclide_debugger$Service,
  NuclideDebuggerProvider,
} from '../../nuclide-debugger-interfaces/service';
import type {OutputService} from '../../nuclide-console/lib/types';
import DebuggerProvider from './DebuggerProvider';
import {setOutputService} from '../../nuclide-debugger-base';

export function consumeOutputService(api: OutputService): void {
  setOutputService(api);
}

export function provideNuclideDebuggerHhvm(): nuclide_debugger$Service {
  return require('./Service');
}

export function createDebuggerProvider(): NuclideDebuggerProvider {
  return DebuggerProvider;
}

export function getHomeFragments(): HomeFragments {
  return {
    feature: {
      title: 'HHVM Debugger',
      icon: 'plug',
      description: 'Connect to a HHVM server process and debug Hack code from within Nuclide.',
      command: 'nuclide-debugger:toggle',
    },
    priority: 6,
  };
}
