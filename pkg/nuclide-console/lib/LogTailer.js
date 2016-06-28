'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Message} from './types';

import {DisposableSubscription} from '../../commons-node/stream';
import {track} from '../../nuclide-analytics';
import Rx from 'rxjs';

type EventNames = {
  start: string;
  stop: string;
  restart: string;
  error: string;
};

/**
 * A utility for writing packages that tail log sources. Just give it a cold observable and let it
 * handle the rest.
 */
export class LogTailer {
  _eventNames: EventNames;
  _subscription: ?rx$ISubscription;
  _input$: Rx.Observable<Message>;
  _message$: Rx.Subject<Message>;
  _running: Rx.BehaviorSubject<boolean>;

  constructor(input$: Rx.Observable<Message>, eventNames: EventNames) {
    this._input$ = input$;
    this._eventNames = eventNames;
    this._message$ = new Rx.Subject();
    this._running = new Rx.BehaviorSubject(false);
  }

  start(): void {
    this._start();
  }

  stop(): void {
    this._stop();
  }

  restart(): void {
    track(this._eventNames.restart);
    this._stop(false);
    this._start(false);
  }

  observeStatus(cb: (status: 'running' | 'stopped') => void): IDisposable {
    return new DisposableSubscription(
      this._running.map(isRunning => (isRunning ? 'running' : 'stopped')).subscribe(cb)
    );
  }

  _start(trackCall: boolean = true): void {
    atom.commands.dispatch(atom.views.getView(atom.workspace), 'nuclide-console:show');

    if (this._running.getValue()) {
      return;
    }
    if (trackCall) {
      track(this._eventNames.start);
    }

    this._running.next(true);

    if (this._subscription != null) {
      this._subscription.unsubscribe();
    }

    this._subscription = this._input$.subscribe(
      message => { this._message$.next(message); },
      err => {
        this._stop(false);
        track(this._eventNames.error, {message: err.message});
      }
    );
  }

  _stop(trackCall: boolean = true): void {
    if (!this._running.getValue()) {
      return;
    }
    if (trackCall) {
      track(this._eventNames.stop);
    }

    this._running.next(false);

    if (this._subscription != null) {
      this._subscription.unsubscribe();
    }
  }

  getMessages(): Rx.Observable<Message> {
    return this._message$.asObservable();
  }

}
