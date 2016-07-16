'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type DiffViewModel from './DiffViewModel';
import type {RevisionsState, DiffStatusDisplay} from './types';
import type {RevisionInfo} from '../../nuclide-hg-repository-base/lib/HgService';

import {CompositeDisposable} from 'atom';
import {React} from 'react-for-atom';
import RevisionTimelineNode from './RevisionTimelineNode';
import UncommittedChangesTimelineNode from './UncommittedChangesTimelineNode';
import {DiffMode} from './constants';
import {
  Button,
  ButtonSizes,
} from '../../nuclide-ui/lib/Button';

type DiffTimelineViewProps = {
  diffModel: DiffViewModel;
  onSelectionChange: (revisionInfo: RevisionInfo) => any;
};

type DiffTimelineViewState = {
  revisionsState: ?RevisionsState;
};

export default class DiffTimelineView extends React.Component {
  props: DiffTimelineViewProps;
  state: DiffTimelineViewState;
  _subscriptions: CompositeDisposable;

  constructor(props: DiffTimelineViewProps) {
    super(props);
    this._subscriptions = new CompositeDisposable();
    (this: any)._updateRevisions = this._updateRevisions.bind(this);
    (this: any)._handleClickPublish = this._handleClickPublish.bind(this);
    this.state = {
      revisionsState: null,
    };
  }

  componentDidMount(): void {
    const {diffModel} = this.props;
    this._subscriptions.add(
      diffModel.onRevisionsUpdate(this._updateRevisions),
    );
    diffModel.getActiveRevisionsState().then(this._updateRevisions);
  }

  _updateRevisions(newRevisionsState: ?RevisionsState): void {
    this.setState({
      revisionsState: newRevisionsState,
    });
  }

  render(): ?React.Element<any> {
    let content = null;
    const {diffModel, onSelectionChange} = this.props;
    const {revisionsState} = this.state;
    if (revisionsState == null) {
      content = 'Revisions not loaded...';
    } else {
      const {revisions, compareCommitId, commitId, diffStatuses} = revisionsState;
      content = (
        <RevisionsTimelineComponent
          diffModel={diffModel}
          compareRevisionId={compareCommitId || commitId}
          dirtyFileCount={diffModel.getActiveStackDirtyFileChanges().size}
          onSelectionChange={onSelectionChange}
          onClickPublish={this._handleClickPublish}
          revisions={revisions}
          diffStatuses={diffStatuses}
        />
      );
    }

    return (
      <div className="nuclide-diff-timeline padded">
        {content}
      </div>
    );
  }

  _handleClickPublish(): void {
    const {diffModel} = this.props;
    diffModel.setViewMode(DiffMode.PUBLISH_MODE);
  }

  componentWillUnmount(): void {
    this._subscriptions.dispose();
  }
}

type RevisionsComponentProps = {
  diffModel: DiffViewModel;
  compareRevisionId: number;
  dirtyFileCount: number;
  onSelectionChange: (revisionInfo: RevisionInfo) => mixed;
  onClickPublish: () => mixed;
  revisions: Array<RevisionInfo>;
  diffStatuses: Map<number, DiffStatusDisplay>;
};

function RevisionsTimelineComponent(props: RevisionsComponentProps): React.Element<any> {

  const {revisions, compareRevisionId, diffStatuses} = props;
  const latestToOldestRevisions = revisions.slice().reverse();
  const selectedIndex = latestToOldestRevisions.findIndex(
    revision => revision.id === compareRevisionId,
  );

  return (
    <div className="revision-timeline-wrap">
      <Button
        className="pull-right"
        size={ButtonSizes.SMALL}
        onClick={props.onClickPublish}>
        Publish to Phabricator
      </Button>
      <h5 style={{marginTop: 0}}>Compare Revisions</h5>
      <div className="revision-selector">
        <div className="revisions">
          <UncommittedChangesTimelineNode
            diffModel={props.diffModel}
            dirtyFileCount={props.dirtyFileCount}
          />
          {latestToOldestRevisions.map((revision, i) =>
            <RevisionTimelineNode
              index={i}
              key={revision.hash}
              selectedIndex={selectedIndex}
              revision={revision}
              diffStatus={diffStatuses.get(revision.id)}
              revisionsCount={revisions.length}
              onSelectionChange={props.onSelectionChange}
            />,
          )}
        </div>
      </div>
    </div>
  );

}
