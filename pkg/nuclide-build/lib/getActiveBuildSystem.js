'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {AppState, BuildSystem} from './types';

export function getActiveBuildSystem(state: AppState): ?BuildSystem {
  const activeBuildSystemId = state.activeTaskId && state.activeTaskId.buildSystemId;
  return activeBuildSystemId == null
    ? null
    : state.buildSystems.get(activeBuildSystemId);
}
