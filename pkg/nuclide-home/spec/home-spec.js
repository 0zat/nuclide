'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import featureConfig from '../../commons-atom/featureConfig';

import nuclideUri from '../../commons-node/nuclideUri';

const CONFIG_KEY = 'nuclide-home.showHome';

const openHomePane = () => {
  atom.commands.dispatch(
    atom.views.getView(atom.workspace),
    'nuclide-home:toggle',
    {visible: true},
  );
};

function findHomePaneAndItem(): {pane: ?atom$Pane, item: ?Object} {
  for (const pane of atom.workspace.getPanes()) {
    for (const item of pane.getItems()) {
      if (item.getTitle() === 'Home') {
        return {pane, item};
      }
    }
  }
  return {pane: null, item: null};
}

describe('Home', () => {

  beforeEach(() => {
    waitsForPromise(async () => {
      jasmine.unspy(window, 'setTimeout');
      const config = require('../package.json').nuclide.config;
      // $UPFixMe: With UP, the default settings are set by the loader, but
      // I don't have a good way to do that just for tests (yet).
      Object.keys(config).forEach(k =>
        featureConfig.setSchema(`nuclide-home.${k}`, config[k]),
      );
      const WORKSPACE_VIEW_DIRS = [
        nuclideUri.dirname(require.resolve('../../nuclide-workspace-views/package.json')),
        nuclideUri.dirname(require.resolve('../../nuclide-workspace-view-locations/package.json')),
      ];
      await Promise.all([
        ...WORKSPACE_VIEW_DIRS.map(dir => atom.packages.activatePackage(dir)),
        atom.packages.activatePackage(nuclideUri.join(__dirname, '..')),
      ]);
    });
  });

  it('does not appear by default', () => {
    expect(findHomePaneAndItem().item).toBeTruthy();
  });

  it('appears when opened by URI, persisting into config', () => {
    waitsForPromise(async () => {
      openHomePane();
      const {item} = findHomePaneAndItem();
      expect(item).toBeTruthy();
      if (item) {
        expect(item.getTitle()).toEqual('Home');
        expect(item.element.innerHTML).toContain('Welcome to Nuclide');
        expect(featureConfig.get(CONFIG_KEY)).toBeTruthy();
      }
    });
  });

  it('disappears when closed, persisting into config', () => {
    waitsForPromise(async () => {
      openHomePane();
      const {pane, item} = findHomePaneAndItem();
      expect(item).toBeTruthy();
      if (pane && item) {
        pane.activateItem(item);
        atom.commands.dispatch(atom.views.getView(atom.workspace), 'core:close');
        expect(findHomePaneAndItem().item).toBeFalsy();
        expect(featureConfig.get(CONFIG_KEY)).toBeFalsy();
      }
    });
  });

});
