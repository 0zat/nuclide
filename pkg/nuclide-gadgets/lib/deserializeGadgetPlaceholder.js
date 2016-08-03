'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import {React} from 'react-for-atom';
import GadgetPlaceholder from './GadgetPlaceholder';

module.exports = function deserializeGadgetPlaceholder(
  state: Object,
): React.Component<any, any, any> {
  // Pane items are deserialized before the gadget providers have had a chance to register their
  // gadgets. Therefore, we need to create a placeholder item that we later replace.
  return GadgetPlaceholder.deserialize(state);
};
