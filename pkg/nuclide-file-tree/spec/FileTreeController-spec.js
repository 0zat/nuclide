'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import FileTreeActions from '../lib/FileTreeActions';
import FileTreeController from '../lib/FileTreeController';
import {FileTreeStore} from '../lib/FileTreeStore';
import type {FileTreeNode} from '../lib/FileTreeNode';

import nuclideUri from '../../nuclide-remote-uri';
import invariant from 'assert';

describe('FileTreeController', () => {
  const actions = FileTreeActions.getInstance();
  const store = FileTreeStore.getInstance();

  let controller: FileTreeController = (null: any);
  let workspaceElement;

  function getNode(rootKey: string, nodeKey: string): FileTreeNode {
    const node = store.getNode(rootKey, nodeKey);
    invariant(node);
    return node;
  }

  function isSelected(rootKey: string, nodeKey: string): boolean {
    return getNode(rootKey, nodeKey).isSelected;
  }

  function isExpanded(rootKey: string, nodeKey: string): boolean {
    return getNode(rootKey, nodeKey).isExpanded;
  }

  beforeEach(() => {
    workspaceElement = atom.views.getView(atom.workspace);
    // Attach the workspace to the DOM so focus can be determined in tests below.
    jasmine.attachToDOM(workspaceElement);
    controller = new FileTreeController(null);

    // The controller uses the currently active file to decide when and what to reveal in the file
    // tree when revealActiveFile is called. Importantly, it also short-circuits in some cases if
    // the path is null or undefined. Here we mock it out so that we get normal behavior in our
    // tests.
    spyOn(atom.workspace, 'getActiveTextEditor').andReturn({
      getPath() {
        return 'foo';
      },
    });
  });

  afterEach(() => {
    controller.destroy();
    store.reset();
  });

  describe('navigating with the keyboard', () => {
    const rootKey = nuclideUri.join(__dirname, 'fixtures') + '/';
    const dir1Key = nuclideUri.join(__dirname, 'fixtures/dir1') + '/';
    const fooTxtKey = nuclideUri.join(__dirname, 'fixtures/dir1/foo.txt');
    const dir2Key = nuclideUri.join(__dirname, 'fixtures/dir2') + '/';

    describe('with a collapsed root', () => {
      /*
       * Start with a simple structure that looks like the following:
       *
       *   → fixtures
       */
      describe('via _collapseSelection (left arrow)', () => {
        it('does not modify the selection if the root is selected', () => {
          actions.setSelectedNode(rootKey, rootKey);
          expect(isSelected(rootKey, rootKey)).toEqual(true);
          controller._collapseSelection();

          // root was expanded, selection shouldn't change
          expect(isSelected(rootKey, rootKey)).toEqual(true);
        });
      });
    });

    describe('with single nesting', () => {
      beforeEach(() => {
        /*
         * ༼ つ ◕_◕ ༽つ
         * Start with an expanded and fetched state that looks like the following:
         *
         *   ↓ fixtures
         *     → dir1
         *     → dir2
         */
        waitsForPromise(async () => {
          actions.expandNode(rootKey, rootKey);
          // Populate real files from real disk like real people.
          await store._fetchChildKeys(rootKey);
        });
      });

      describe('via _collapseSelection (left arrow) nested', () => {
        it('selects the parent if the selected node is a collapsed directory', () => {
          actions.setSelectedNode(rootKey, dir2Key);
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
          controller._collapseSelection();

          // the root is dir2's parent
          expect(isSelected(rootKey, rootKey)).toEqual(true);
        });

        it('does not modify the selection if selected node is an expanded directory', () => {
          actions.setSelectedNode(rootKey, rootKey);
          expect(isSelected(rootKey, rootKey)).toEqual(true);
          controller._collapseSelection();

          // root was expanded, selection shouldn't change
          expect(isSelected(rootKey, rootKey)).toEqual(true);
        });
      });

      describe('via _moveDown', () => {
        it('selects the first root if there is no selection', () => {
          expect(store.getSingleSelectedNode()).toBeNull();
          controller._moveDown();
          expect(isSelected(rootKey, rootKey)).toEqual(true);
        });

        it('does nothing if the bottommost node is selected', () => {
          actions.setSelectedNode(rootKey, dir2Key);
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
          controller._moveDown();
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
        });

        it('selects first child if parent is selected', () => {
          actions.setSelectedNode(rootKey, rootKey);
          expect(isSelected(rootKey, rootKey)).toEqual(true);
          controller._moveDown();

          // dir1 is the first child, should get selected
          expect(isSelected(rootKey, dir1Key)).toEqual(true);
        });

        it('selects the next sibling when one exists', () => {
          actions.setSelectedNode(rootKey, dir1Key);
          expect(isSelected(rootKey, dir1Key)).toEqual(true);
          controller._moveDown();

          // dir2 is the next sibling, should get selected
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
        });
      });

      describe('via _moveUp', () => {
        it('selects the lowermost descendant if there is no selection', () => {
          expect(store.getSingleSelectedNode()).toBeNull();
          controller._moveUp();
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
        });

        it('does nothing if the topmost root node is selected', () => {
          actions.setSelectedNode(rootKey, rootKey);
          expect(isSelected(rootKey, rootKey)).toEqual(true);
          controller._moveUp();
          expect(isSelected(rootKey, rootKey)).toEqual(true);
        });

        it('selects parent if first child is selected', () => {
          actions.setSelectedNode(rootKey, dir1Key);
          expect(isSelected(rootKey, dir1Key)).toEqual(true);
          controller._moveUp();

          // dir1 is the first child, parent (root) should get selected
          expect(isSelected(rootKey, rootKey)).toEqual(true);
        });

        it('selects the previous sibling if one exists', () => {
          actions.setSelectedNode(rootKey, dir2Key);
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
          controller._moveUp();

          // dir2 is the second child, previous sibling (dir1) should be selected
          expect(isSelected(rootKey, dir1Key)).toEqual(true);
        });

        it('selects the root after deselecting via collapsing', () => {
          actions.setSelectedNode(rootKey, dir2Key);
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
          actions.collapseNode(rootKey, rootKey);
          expect(isSelected(rootKey, dir2Key)).toEqual(false);
          controller._moveUp();

          expect(isSelected(rootKey, rootKey)).toEqual(true);
        });
      });
    });

    describe('with double+ nesting', () => {
      beforeEach(() => {
        waitsForPromise(async () => {
          /*
           * ¯\_(ツ)_/¯
           * Expand to a view like the following:
           *
           *   ↓ fixtures
           *     ↓ dir1
           *       · foo.txt
           *     → dir2
           */
          actions.expandNode(rootKey, rootKey);
          await store._fetchChildKeys(rootKey);
          actions.expandNode(rootKey, dir1Key);
          await store._fetchChildKeys(dir1Key);
        });
      });

      describe('via _collapseAll ( cmd+{ )', () => {
        it('collapses all visible nodes', () => {
          controller._collapseAll();
          expect(isExpanded(rootKey, rootKey)).toBe(false);
          expect(isExpanded(rootKey, dir1Key)).toBe(false);
        });
      });

      describe('via _collapseSelection (left arrow) nested double+', () => {
        it('selects the parent if the selected node is a file', () => {
          actions.setSelectedNode(rootKey, fooTxtKey);
          expect(isSelected(rootKey, fooTxtKey)).toEqual(true);
          controller._collapseSelection();

          // dir1 is foo.txt's parent
          expect(isSelected(rootKey, dir1Key)).toEqual(true);
        });
      });

      describe('via _moveDown nested double+', () => {
        it('selects the previous nested descendant when one exists', () => {
          actions.setSelectedNode(rootKey, fooTxtKey);
          expect(isSelected(rootKey, fooTxtKey)).toEqual(true);
          controller._moveDown();

          // foo.txt is the previous visible descendant to dir2
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
        });
      });

      describe('via _moveUp nested double+', () => {
        it('selects the previous nested descendant when one exists', () => {
          actions.setSelectedNode(rootKey, dir2Key);
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
          controller._moveUp();

          // foo.txt is the previous visible descendant to dir2
          expect(isSelected(rootKey, fooTxtKey)).toEqual(true);
        });
      });

      describe('via _moveToTop', () => {
        it('selects the root', () => {
          actions.setSelectedNode(rootKey, dir2Key);
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
          controller._moveToTop();

          // the root is the topmost node
          expect(isSelected(rootKey, rootKey)).toEqual(true);
        });
      });

      describe('via _moveToBottom', () => {
        it('selects the bottommost node', () => {
          actions.setSelectedNode(rootKey, rootKey);
          expect(isSelected(rootKey, rootKey)).toEqual(true);
          controller._moveToBottom();

          // dir2 is the bottommost node
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
        });
      });
    });

    describe('with an expanded + loading directory', () => {
      beforeEach(() => {
        waitsForPromise(async () => {
          /*
           * Expand to a view like the following with a loading (indicated by ↻) dir1:
           *
           *   ↓ fixtures
           *     ↻ dir1
           *     → dir2
           */
          actions.expandNode(rootKey, rootKey);
          await store._fetchChildKeys(rootKey);
          // Mimic the loading state where `dir1` reports itself as expanded but has no children
          // yet. Don't use `actions.expandNode` because it causes a re-render, which queues a real
          // fetch and might populate the children of `dir1`. We don't want that.
          store._updateNodeAtRoot(
            rootKey,
            dir1Key,
            node => node.set({isLoading: true, isExpanded: true})
          );
        });
      });

      describe('via _moveDown expanded + loading', () => {
        it('selects the next sibling', () => {
          actions.setSelectedNode(rootKey, dir1Key);
          expect(isSelected(rootKey, dir1Key)).toEqual(true);
          controller._moveDown();
          // dir2 is dir1's next sibling
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
        });
      });

      describe('via _moveUp expanded + loading', () => {
        it('selects the previous sibling', () => {
          actions.setSelectedNode(rootKey, dir2Key);
          expect(isSelected(rootKey, dir2Key)).toEqual(true);
          controller._moveUp();

          // dir1 is dir2's previous sibling
          expect(isSelected(rootKey, dir1Key)).toEqual(true);
        });
      });
    });
  });
});
