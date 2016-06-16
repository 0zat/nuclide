'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import ConnectionDetailsForm from './ConnectionDetailsForm';
import {MutableListSelector} from '../../nuclide-ui/lib/MutableListSelector';
import {React} from 'react-for-atom';

import type {
  NuclideRemoteConnectionParams,
  NuclideRemoteConnectionParamsWithPassword,
  NuclideRemoteConnectionProfile,
} from './connection-types';

type Props = {
  // The initial list of connection profiles that will be displayed.
  // Whenever a user add/removes profiles via the child NuclideListSelector,
  // these props should be updated from the top-level by calling ReactDOM.render()
  // again (with the new props) on the ConnectionDetailsPrompt.
  connectionProfiles: ?Array<NuclideRemoteConnectionProfile>;
  // If there is >= 1 connection profile, this index indicates the profile to use.
  indexOfSelectedConnectionProfile: ?number;
  // Function to call when 'enter'/'confirm' is selected by the user in this view.
  onConfirm: () => mixed;
  // Function to call when 'cancel' is selected by the user in this view.
  onCancel: () => mixed;
  onDidChange: () => mixed;
  // Function that is called when the "+" button on the profiles list is clicked.
  // The user's intent is to create a new profile.
  onAddProfileClicked: () => mixed;
  // Function that is called when the "-" button on the profiles list is clicked
  // ** while a profile is selected **.
  // The user's intent is to delete the currently-selected profile.
  onDeleteProfileClicked: (indexOfSelectedConnectionProfile: number) => mixed;
  onProfileClicked: (indexOfSelectedConnectionProfile: number) => mixed;
};

/**
 * This component contains the entire view in which the user inputs their
 * connection information when connecting to a remote project.
 * This view contains the ConnectionDetailsForm on the left side, and a
 * NuclideListSelector on the right side that displays 0 or more connection
 * 'profiles'. Clicking on a 'profile' in the NuclideListSelector auto-fills
 * the form with the information associated with that profile.
 */
export default class ConnectionDetailsPrompt extends React.Component {
  props: Props;

  _settingFormFieldsLock: boolean;

  constructor(props: Props) {
    super(props);
    this._settingFormFieldsLock = false;
    (this: any)._handleConnectionDetailsFormDidChange =
      this._handleConnectionDetailsFormDidChange.bind(this);
    (this: any)._onProfileClicked = this._onProfileClicked.bind(this);
    (this: any)._onDeleteProfileClicked = this._onDeleteProfileClicked.bind(this);
  }

  componentDidUpdate(prevProps: Props, prevState: void) {
    // Manually update the contents of an existing `ConnectionDetailsForm`, because it contains
    // `AtomInput` components (which don't update their contents when their props change).
    if (
      prevProps.indexOfSelectedConnectionProfile !== this.props.indexOfSelectedConnectionProfile
      || (
        // If the connection profiles changed length, the effective selected profile also changed.
        prevProps.connectionProfiles != null
        && this.props.connectionProfiles != null
        && prevProps.connectionProfiles.length !== this.props.connectionProfiles.length
      )
    ) {
      const existingConnectionDetailsForm = this.refs['connection-details-form'];
      if (existingConnectionDetailsForm) {
        this._settingFormFieldsLock = true;
        existingConnectionDetailsForm.setFormFields(this.getPrefilledConnectionParams());
        existingConnectionDetailsForm.clearPassword();
        this._settingFormFieldsLock = false;
        existingConnectionDetailsForm.focus();
      }
    }
  }

  focus(): void {
    this.refs['connection-details-form'].focus();
  }

  getFormFields(): NuclideRemoteConnectionParamsWithPassword {
    return this.refs['connection-details-form'].getFormFields();
  }

  getPrefilledConnectionParams(): ?NuclideRemoteConnectionParams {
    // If there are profiles, pre-fill the form with the information from the
    // specified selected profile.
    if (this.props.connectionProfiles != null &&
        this.props.connectionProfiles.length > 0 &&
        this.props.indexOfSelectedConnectionProfile != null) {
      const selectedProfile =
        this.props.connectionProfiles[this.props.indexOfSelectedConnectionProfile];
      return selectedProfile.params;
    }
  }

  _handleConnectionDetailsFormDidChange(): void {
    if (this._settingFormFieldsLock) {
      return;
    }

    this.props.onDidChange();
  }

  _onProfileClicked(profileId: string): void {
    // The id of a profile is its index in the list of props.
    this.props.onProfileClicked(parseInt(profileId, 10));
  }

  _onDeleteProfileClicked(profileId: ?string): void {
    if (profileId == null) {
      return;
    }
    // The id of a profile is its index in the list of props.
    this.props.onDeleteProfileClicked(parseInt(profileId, 10));
  }

  render(): React.Element<any> {
    // If there are profiles, pre-fill the form with the information from the
    // specified selected profile.
    const prefilledConnectionParams = this.getPrefilledConnectionParams() || {};

    // Create helper data structures.
    let listSelectorItems;
    if (this.props.connectionProfiles) {
      listSelectorItems = this.props.connectionProfiles.map((profile, index) => {
        // Use the index of each profile as its id. This is safe because the
        // items are immutable (within this React component).
        return {
          deletable: profile.deletable,
          displayTitle: profile.displayTitle,
          id: String(index),
          saveable: profile.saveable,
        };
      });
    } else {
      listSelectorItems = [];
    }

    const idOfSelectedItem = (this.props.indexOfSelectedConnectionProfile == null)
      ? null
      : String(this.props.indexOfSelectedConnectionProfile);

    return (
      <div className="nuclide-connection-details-prompt container-fluid">
        <div className="row" style={{display: 'flex'}}>
          <div className="connection-profiles col-xs-3 inset-panel">
            <h6>Profiles</h6>
            <MutableListSelector
              items={listSelectorItems}
              idOfSelectedItem={idOfSelectedItem}
              onItemClicked={this._onProfileClicked}
              onItemDoubleClicked={this.props.onConfirm}
              onAddButtonClicked={this.props.onAddProfileClicked}
              onDeleteButtonClicked={this._onDeleteProfileClicked}
            />
          </div>
          <div className="connection-details-form col-xs-9">
            <ConnectionDetailsForm
              initialUsername={prefilledConnectionParams.username}
              initialServer={prefilledConnectionParams.server}
              initialRemoteServerCommand={prefilledConnectionParams.remoteServerCommand}
              initialCwd={prefilledConnectionParams.cwd}
              initialSshPort={prefilledConnectionParams.sshPort}
              initialPathToPrivateKey={prefilledConnectionParams.pathToPrivateKey}
              initialAuthMethod={prefilledConnectionParams.authMethod}
              onConfirm={this.props.onConfirm}
              onCancel={this.props.onCancel}
              onDidChange={this._handleConnectionDetailsFormDidChange}
              ref="connection-details-form"
            />
          </div>
        </div>
      </div>
    );
  }
}
