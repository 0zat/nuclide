'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {
  FileChangeState,
  OffsetMap,
  DiffModeType,
  UIElement,
} from './types';
import type DiffViewModel from './DiffViewModel';
import type {RevisionInfo} from '../../nuclide-hg-rpc/lib/HgService';
import type {NuclideUri} from '../../commons-node/nuclideUri';

import invariant from 'assert';
import {CompositeDisposable, Disposable, TextBuffer} from 'atom';
import {
  React,
  ReactDOM,
} from 'react-for-atom';
import DiffViewEditorPane from './DiffViewEditorPane';
import DiffViewTree from './DiffViewTree';
import SyncScroll from './SyncScroll';
import DiffTimelineView from './DiffTimelineView';
import DiffViewToolbar from './DiffViewToolbar';
import DiffNavigationBar from './DiffNavigationBar';
import DiffCommitView from './DiffCommitView';
import DiffPublishView from './DiffPublishView';
import {computeDiff, getOffsetLineNumber} from './diff-utils';
import createPaneContainer from '../../commons-atom/create-pane-container';
import {bufferForUri} from '../../commons-atom/text-editor';
import {DiffMode} from './constants';
import passesGK from '../../commons-node/passesGK';

type Props = {
  diffModel: DiffViewModel,
  // A bound function that when invoked will try to trigger the Diff View NUX
  tryTriggerNux: () => void,
};

type EditorState = {
  revisionTitle: string,
  text: string,
  offsets: OffsetMap,
  highlightedLines: {
    added: Array<number>,
    removed: Array<number>,
  },
  inlineElements: Array<UIElement>,
};

type State = {
  filePath: NuclideUri,
  oldEditorState: EditorState,
  newEditorState: EditorState,
  toolbarVisible: boolean,
};

function initialEditorState(): EditorState {
  return {
    revisionTitle: '',
    text: '',
    offsets: new Map(),
    highlightedLines: {
      added: [],
      removed: [],
    },
    inlineElements: [],
  };
}

const EMPTY_FUNCTION = () => {};
const SCROLL_FIRST_CHANGE_DELAY_MS = 100;

class DiffViewComponent extends React.Component {
  props: Props;
  state: State;

  _subscriptions: CompositeDisposable;
  _syncScroll: SyncScroll;
  _oldEditorPane: atom$Pane;
  _oldEditorComponent: DiffViewEditorPane;
  _paneContainer: Object;
  _newEditorPane: atom$Pane;
  _newEditorComponent: DiffViewEditorPane;
  _bottomRightPane: atom$Pane;
  _timelineComponent: ?DiffTimelineView;
  _treePane: atom$Pane;
  _treeComponent: React.Component<any, any, any>;
  _navigationPane: atom$Pane;
  _navigationComponent: DiffNavigationBar;
  _publishComponent: ?DiffPublishView;
  _readonlyBuffer: atom$TextBuffer;

  constructor(props: Props) {
    super(props);
    this.state = {
      mode: DiffMode.BROWSE_MODE,
      filePath: '',
      toolbarVisible: true,
      oldEditorState: initialEditorState(),
      newEditorState: initialEditorState(),
    };
    (this: any)._onModelStateChange = this._onModelStateChange.bind(this);
    (this: any)._updateLineDiffState = this._updateLineDiffState.bind(this);
    (this: any)._onChangeNewTextEditor = this._onChangeNewTextEditor.bind(this);
    (this: any)._onTimelineChangeRevision = this._onTimelineChangeRevision.bind(this);
    (this: any)._onNavigationClick = this._onNavigationClick.bind(this);
    (this: any)._onDidUpdateTextEditorElement = this._onDidUpdateTextEditorElement.bind(this);
    (this: any)._onChangeMode = this._onChangeMode.bind(this);
    (this: any)._onSwitchToEditor = this._onSwitchToEditor.bind(this);
    this._readonlyBuffer = new TextBuffer();
    this._subscriptions = new CompositeDisposable();
  }

  componentDidMount(): void {
    const {diffModel, tryTriggerNux} = this.props;
    this._subscriptions.add(diffModel.onActiveFileUpdates(activeFileState => {
      this._updateLineDiffState(activeFileState);
      // The diff tree needs to update the active diffed file.
      // TODO(most): merge ActiveFileState into DiffModel's State.
      this._renderTree();
    }));
    this._subscriptions.add(diffModel.onDidUpdateState(this._onModelStateChange));
    this._subscriptions.add(atom.workspace.onDidChangeActivePaneItem(activeItem => {
      if (activeItem != null && (activeItem: any).tagName === 'NUCLIDE-DIFF-VIEW') {
        // Re-render on activation.
        this._updateLineDiffState(diffModel.getActiveFileState());
      }
    }));

    this._paneContainer = createPaneContainer();
    // The changed files status tree takes 1/5 of the width and lives on the right most,
    // while being vertically splt with the revision timeline stack pane.
    const topPane = this._newEditorPane = this._paneContainer.getActivePane();
    this._bottomRightPane = topPane.splitDown({
      flexScale: 0.3,
    });
    this._treePane = this._bottomRightPane.splitLeft({
      flexScale: 0.35,
    });
    this._navigationPane = topPane.splitRight({
      flexScale: 0.045,
    });
    this._oldEditorPane = topPane.splitLeft({
      flexScale: 1,
    });

    this._renderDiffView();

    this._subscriptions.add(
      this._destroyPaneDisposable(this._oldEditorPane),
      this._destroyPaneDisposable(this._newEditorPane),
      this._destroyPaneDisposable(this._navigationPane),
      this._destroyPaneDisposable(this._treePane),
      this._destroyPaneDisposable(this._bottomRightPane),
    );

    ReactDOM.findDOMNode(this.refs.paneContainer).appendChild(
      atom.views.getView(this._paneContainer),
    );

    this._updateLineDiffState(diffModel.getActiveFileState());

    tryTriggerNux();
  }

  _onModelStateChange(): void {
    this.setState({});
  }

  _setupSyncScroll(): void {
    if (this._oldEditorComponent == null || this._newEditorComponent == null) {
      return;
    }
    const oldTextEditorElement = this._oldEditorComponent.getEditorDomElement();
    const newTextEditorElement = this._newEditorComponent.getEditorDomElement();
    const syncScroll = this._syncScroll;
    if (syncScroll != null) {
      syncScroll.dispose();
      this._subscriptions.remove(syncScroll);
    }
    this._syncScroll = new SyncScroll(
      oldTextEditorElement,
      newTextEditorElement,
    );
    this._subscriptions.add(this._syncScroll);
  }

  _scrollToFirstHighlightedLine(): void {
    // Schedule scroll to first line after all lines have been rendered.
    const {oldEditorState, newEditorState, filePath} = this.state;
    const removedLines = oldEditorState.highlightedLines.removed;
    const addedLines = newEditorState.highlightedLines.added;
    if (addedLines.length === 0 && removedLines.length === 0) {
      return;
    }
    const firstRemovedLine = getOffsetLineNumber(
      removedLines[0] || 0,
      oldEditorState.offsets,
    );
    const firstAddedLine = getOffsetLineNumber(
      addedLines[0] || 0,
      newEditorState.offsets,
    );
    const scrollTimeout = setTimeout(() => {
      this._subscriptions.remove(clearScrollTimeoutSubscription);
      if (this.state.filePath !== filePath) {
        return;
      }
      if (
        addedLines.length === 0 ||
        (removedLines.length > 0 && firstRemovedLine < firstAddedLine)
      ) {
        this._oldEditorComponent.scrollToScreenLine(firstRemovedLine);
      } else {
        this._newEditorComponent.scrollToScreenLine(firstAddedLine);
      }
    }, SCROLL_FIRST_CHANGE_DELAY_MS);
    const clearScrollTimeoutSubscription = new Disposable(() => {
      clearTimeout(scrollTimeout);
    });
    this._subscriptions.add(clearScrollTimeoutSubscription);
  }

  _onChangeMode(mode: DiffModeType): void {
    this.props.diffModel.setViewMode(mode);
  }

  _renderDiffView(): void {
    this._renderTree();
    this._renderEditors();
    this._renderNavigation();
    this._renderBottomRightPane();
  }

  _renderBottomRightPane(): void {
    const {viewMode} = this.props.diffModel.getState();
    switch (viewMode) {
      case DiffMode.BROWSE_MODE:
        this._renderTimelineView();
        this._publishComponent = null;
        break;
      case DiffMode.COMMIT_MODE:
        this._renderCommitView();
        this._timelineComponent = null;
        this._publishComponent = null;
        break;
      case DiffMode.PUBLISH_MODE:
        this._renderPublishView();
        this._timelineComponent = null;
        break;
      default:
        throw new Error(`Invalid Diff Mode: ${viewMode}`);
    }
  }

  componentDidUpdate(prevProps: Props, prevState: State): void {
    this._renderDiffView();
    if (this.state.filePath !== prevState.filePath) {
      this._scrollToFirstHighlightedLine();
      this.props.diffModel.emitActiveBufferChangeModified();
    }
  }

  async _renderCommitView(): Promise<void> {
    const {
      commitMessage,
      commitMode,
      commitModeState,
    } = this.props.diffModel.getState();

    const passes = await passesGK('nuclide_diff_commit_form');
    let DiffComponent;

    if (passes) {
      // Try requiring private module
      try {
        // $FlowFB
        const {DiffViewCommitForm} = require('./fb/DiffViewCommitForm');
        DiffComponent = DiffViewCommitForm;
      } catch (ex) {
        DiffComponent = DiffCommitView;
      }
    } else {
      DiffComponent = DiffCommitView;
    }

    ReactDOM.render(
      <DiffComponent
        commitMessage={commitMessage}
        commitMode={commitMode}
        commitModeState={commitModeState}
        // `diffModel` is acting as the action creator for commit view and needs to be passed so
        // methods can be called on it.
        diffModel={this.props.diffModel}
      />,
      this._getPaneElement(this._bottomRightPane),
    );
  }

  _renderPublishView(): void {
    const {diffModel} = this.props;
    const {
      publishMode,
      publishModeState,
      publishMessage,
      headRevision,
    } = diffModel.getState();
    const component = ReactDOM.render(
      <DiffPublishView
        publishModeState={publishModeState}
        message={publishMessage}
        publishMode={publishMode}
        headRevision={headRevision}
        diffModel={diffModel}
      />,
      this._getPaneElement(this._bottomRightPane),
    );
    invariant(component instanceof DiffPublishView);
    this._publishComponent = component;
  }

  _renderTree(): void {
    const {diffModel} = this.props;
    const {selectedFileChanges, showNonHgRepos} = diffModel.getState();
    const {filePath} = diffModel.getActiveFileState();
    this._treeComponent = ReactDOM.render(
      (
        <div className="nuclide-diff-view-tree padded">
          <DiffViewTree
            activeFilePath={filePath}
            fileChanges={selectedFileChanges}
            showNonHgRepos={showNonHgRepos}
            diffModel={diffModel}
          />
        </div>
      ),
      this._getPaneElement(this._treePane),
    );
  }

  _renderEditors(): void {
    const {filePath, oldEditorState: oldState, newEditorState: newState} = this.state;
    const oldEditorComponent = ReactDOM.render(
        <DiffViewEditorPane
          headerTitle={oldState.revisionTitle}
          textBuffer={this._readonlyBuffer}
          filePath={filePath}
          offsets={oldState.offsets}
          highlightedLines={oldState.highlightedLines}
          textContent={oldState.text}
          inlineElements={oldState.inlineElements}
          readOnly={true}
          onChange={EMPTY_FUNCTION}
          onDidUpdateTextEditorElement={EMPTY_FUNCTION}
        />,
        this._getPaneElement(this._oldEditorPane),
    );
    invariant(oldEditorComponent instanceof DiffViewEditorPane);
    this._oldEditorComponent = oldEditorComponent;
    const textBuffer = bufferForUri(filePath);
    const newEditorComponent = ReactDOM.render(
        <DiffViewEditorPane
          headerTitle={newState.revisionTitle}
          textBuffer={textBuffer}
          filePath={filePath}
          offsets={newState.offsets}
          highlightedLines={newState.highlightedLines}
          inlineElements={newState.inlineElements}
          onDidUpdateTextEditorElement={this._onDidUpdateTextEditorElement}
          readOnly={false}
          onChange={this._onChangeNewTextEditor}
        />,
        this._getPaneElement(this._newEditorPane),
    );
    invariant(newEditorComponent instanceof DiffViewEditorPane);
    this._newEditorComponent = newEditorComponent;
  }

  _onDidUpdateTextEditorElement(): void {
    this._setupSyncScroll();
  }

  _renderTimelineView(): void {
    const component = ReactDOM.render(
      <DiffTimelineView
        diffModel={this.props.diffModel}
        onSelectionChange={this._onTimelineChangeRevision}
      />,
      this._getPaneElement(this._bottomRightPane),
    );
    invariant(component instanceof DiffTimelineView);
    this._timelineComponent = component;
  }

  _renderNavigation(): void {
    const {oldEditorState, newEditorState} = this.state;
    const {offsets: oldOffsets, highlightedLines: oldLines, text: oldContents} = oldEditorState;
    const {offsets: newOffsets, highlightedLines: newLines, text: newContents} = newEditorState;
    const navigationPaneElement = this._getPaneElement(this._navigationPane);
    const component = ReactDOM.render(
      <DiffNavigationBar
        elementHeight={navigationPaneElement.clientHeight}
        addedLines={newLines.added}
        newOffsets={newOffsets}
        newContents={newContents}
        removedLines={oldLines.removed}
        oldOffsets={oldOffsets}
        oldContents={oldContents}
        onClick={this._onNavigationClick}
      />,
      navigationPaneElement,
    );
    invariant(component instanceof DiffNavigationBar);
    this._navigationComponent = component;
  }

  _onNavigationClick(lineNumber: number, isAddedLine: boolean): void {
    const textEditorComponent = isAddedLine ? this._newEditorComponent : this._oldEditorComponent;
    invariant(textEditorComponent, 'Diff View Navigation Error: Non valid text editor component');
    const textEditor = textEditorComponent.getEditorModel();
    textEditor.scrollToBufferPosition([lineNumber, 0]);
  }

  _getPaneElement(pane: atom$Pane): HTMLElement {
    return atom.views.getView(pane).querySelector('.item-views');
  }

  _destroyPaneDisposable(pane: atom$Pane): IDisposable {
    return new Disposable(() => {
      ReactDOM.unmountComponentAtNode(ReactDOM.findDOMNode(this._getPaneElement(pane)));
      pane.destroy();
    });
  }

  componentWillUnmount(): void {
    this._subscriptions.dispose();
  }

  render(): React.Element<any> {
    let toolbarComponent = null;
    if (this.state.toolbarVisible) {
      const {oldEditorState, newEditorState} = this.state;
      toolbarComponent = (
        <DiffViewToolbar
          filePath={this.state.filePath}
          newRevisionTitle={newEditorState.revisionTitle}
          oldRevisionTitle={oldEditorState.revisionTitle}
          onSwitchMode={this._onChangeMode}
          onSwitchToEditor={this._onSwitchToEditor}
        />
      );
    }
    return (
      <div className="nuclide-diff-view-container">
        {toolbarComponent}
        <div className="nuclide-diff-view-component" ref="paneContainer" />
      </div>
    );
  }

  _onSwitchToEditor(): void {
    const diffViewNode = ReactDOM.findDOMNode(this);
    invariant(diffViewNode, 'Diff View DOM needs to be attached to switch to editor mode');
    atom.commands.dispatch(diffViewNode, 'nuclide-diff-view:switch-to-editor');
  }

  _onChangeNewTextEditor(newContents: string): void {
    this.props.diffModel.setNewContents(newContents);
  }

  _onTimelineChangeRevision(revision: RevisionInfo): void {
    this.props.diffModel.setRevision(revision);
  }

  /**
   * Updates the line diff state on active file state change.
   */
  _updateLineDiffState(fileState: FileChangeState): void {
    const {
      filePath,
      oldContents,
      newContents,
      inlineComponents,
      fromRevisionTitle,
      toRevisionTitle,
    } = fileState;

    const {addedLines, removedLines, oldLineOffsets, newLineOffsets} =
      computeDiff(oldContents, newContents);

    // TODO(most): Sync the used comment vertical space on both editors.
    const oldEditorState = {
      revisionTitle: fromRevisionTitle,
      text: oldContents,
      offsets: oldLineOffsets,
      highlightedLines: {
        added: [],
        removed: removedLines,
      },
      inlineElements: inlineComponents || [],
    };
    const newEditorState = {
      revisionTitle: toRevisionTitle,
      text: newContents,
      offsets: newLineOffsets,
      highlightedLines: {
        added: addedLines,
        removed: [],
      },
      inlineElements: [],
    };
    this.setState({
      filePath,
      oldEditorState,
      newEditorState,
    });
  }
}

module.exports = DiffViewComponent;
