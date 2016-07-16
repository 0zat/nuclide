'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {CommitModeStateType} from './types';
import type DiffViewModel from './DiffViewModel';

import {AtomTextEditor} from '../../nuclide-ui/lib/AtomTextEditor';
import {Checkbox} from '../../nuclide-ui/lib/Checkbox';
import classnames from 'classnames';
import {DiffMode, CommitMode, CommitModeState} from './constants';
import {React} from 'react-for-atom';
import {
  Button,
  ButtonSizes,
  ButtonTypes,
} from '../../nuclide-ui/lib/Button';
import {Toolbar} from '../../nuclide-ui/lib/Toolbar';
import {ToolbarLeft} from '../../nuclide-ui/lib/ToolbarLeft';
import {ToolbarRight} from '../../nuclide-ui/lib/ToolbarRight';

type Props = {
  commitMessage: ?string,
  commitMode: string,
  commitModeState: CommitModeStateType,
  diffModel: DiffViewModel,
};

class DiffCommitView extends React.Component {
  props: Props;

  constructor(props: Props) {
    super(props);
    (this: any)._onClickCommit = this._onClickCommit.bind(this);
    (this: any)._onToggleAmend = this._onToggleAmend.bind(this);
    (this: any)._onClickBack = this._onClickBack.bind(this);
  }

  componentDidMount(): void {
    this._setCommitMessage();
  }

  componentDidUpdate(prevProps: Props, prevState: void): void {
    if (this.props.commitMessage !== prevProps.commitMessage) {
      this._setCommitMessage();
    }
  }

  _setCommitMessage(): void {
    this.refs.message.getTextBuffer().setText(this.props.commitMessage || '');
  }

  render(): React.Element<any> {
    const {commitModeState} = this.props;
    const isLoading = commitModeState !== CommitModeState.READY;

    let message;
    if (isLoading) {
      switch (commitModeState) {
        case CommitModeState.AWAITING_COMMIT:
          message = 'Committing...';
          break;
        case CommitModeState.LOADING_COMMIT_MESSAGE:
          message = 'Loading...';
          break;
        default:
          message = 'Unknown Commit State!';
          break;
      }
    } else {
      message = 'Commit';
    }

    const btnClassname = classnames('pull-right', {
      'btn-progress': isLoading,
    });
    return (
      <div className="nuclide-diff-mode">
        <div className="message-editor-wrapper">
          <AtomTextEditor
            gutterHidden={true}
            path=".HG_COMMIT_EDITMSG"
            readOnly={isLoading}
            ref="message"
          />
        </div>
        <Toolbar location="bottom">
          <ToolbarLeft>
            <Checkbox
              checked={this.props.commitMode === CommitMode.AMEND}
              disabled={isLoading}
              label="Amend"
              onChange={this._onToggleAmend}
            />
          </ToolbarLeft>
          <ToolbarRight>
            <Button
              size={ButtonSizes.SMALL}
              onClick={this._onClickBack}>
              Back
            </Button>
            <Button
              className={btnClassname}
              size={ButtonSizes.SMALL}
              buttonType={ButtonTypes.SUCCESS}
              disabled={isLoading}
              onClick={this._onClickCommit}>
              {message}
            </Button>
          </ToolbarRight>
        </Toolbar>
      </div>
    );
  }

  _onClickCommit(): void {
    this.props.diffModel.commit(this._getCommitMessage());
  }

  _onClickBack(): void {
    this.props.diffModel.setViewMode(DiffMode.BROWSE_MODE);
  }

  _getCommitMessage(): string {
    return this.refs.message.getTextBuffer().getText();
  }

  _onToggleAmend(isChecked: boolean): void {
    this.props.diffModel.setCommitMode(isChecked
      ? CommitMode.AMEND
      : CommitMode.COMMIT,
    );
  }

  componentWillUnmount(): void {
    // Save the latest edited commit message for layout switches.
    const message = this._getCommitMessage();
    const {diffModel} = this.props;
    // Let the component unmount before propagating the final message change to the model,
    // So the subsequent change event avoids re-rendering this component.
    process.nextTick(() => {
      diffModel.setCommitMessage(message);
    });
  }
}

module.exports = DiffCommitView;
