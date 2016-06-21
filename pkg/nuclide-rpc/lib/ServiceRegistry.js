'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {NuclideUri} from '../../nuclide-remote-uri';
import {createProxyFactory} from './main';
import {TypeRegistry} from './TypeRegistry';
import type {
  FunctionType,
  Definition,
  InterfaceDefinition,
  Type,
} from './types';
import type {ProxyFactory} from './main';
import invariant from 'assert';
import type {ConfigEntry} from './index';
import type {ObjectRegistry} from './ObjectRegistry';
import nuclideUri from '../../nuclide-remote-uri';
import {builtinLocation} from './builtin-types';

const logger = require('../../nuclide-logging').getLogger();

export type FunctionImplementation = {localImplementation: Function; type: FunctionType};
export type ClassDefinition = {localImplementation: any; definition: InterfaceDefinition};
export type ServiceDefinition = {
  name: string;
  factory: ProxyFactory; // Maps from RpcContext to proxy
};

export class ServiceRegistry {
  _typeRegistry: TypeRegistry;

  /**
   * Store a mapping from function name to a structure holding both the local implementation and
   * the type definition of the function.
   */
  _functionsByName: Map<string, FunctionImplementation>;

  /**
   * Store a mapping from a class name to a struct containing it's local constructor and it's
   * interface definition.
   */
  _classesByName: Map<string, ClassDefinition>;

  _services: Map<string, ServiceDefinition>;

  // Don't call directly, use factory methods below.
  constructor(
    marshalUri: (uri: NuclideUri) => string,
    unmarshalUri: (value: string) => NuclideUri,
    services: Array<ConfigEntry>,
  ) {
    this._typeRegistry = new TypeRegistry();
    this._functionsByName = new Map();
    this._classesByName = new Map();
    this._services = new Map();

    // NuclideUri type requires no transformations (it is done on the client side).
    this._typeRegistry.registerType('NuclideUri', builtinLocation, marshalUri, unmarshalUri);

    this.addServices(services);
  }

  // Create local service registry.
  static createLocal(services: Array<ConfigEntry>): ServiceRegistry {
    return new ServiceRegistry(
      uri => uri,
      remotePath => remotePath,
      services);
  }

  // Create service registry for connections to a remote machine.
  static createRemote(
    hostname: string, services: Array<ConfigEntry>,
  ): ServiceRegistry {
    return new ServiceRegistry(
        remoteUri => nuclideUri.getPath(remoteUri),
        path => nuclideUri.createRemoteUri(hostname, path),
        services);
  }

  addServices(services: Array<ConfigEntry>): void {
    services.forEach(this.addService, this);
  }

  addService(service: ConfigEntry): void {
    const preserveFunctionNames = service.preserveFunctionNames != null
      && service.preserveFunctionNames;
    logger.debug(`Registering 3.0 service ${service.name}...`);
    try {
      const factory = createProxyFactory(
        service.name,
        preserveFunctionNames,
        service.definition,
      );
      // $FlowIssue - the parameter passed to require must be a literal string.
      const localImpl = require(service.implementation);
      this._services.set(service.name, {
        name: service.name,
        factory,
      });

      // Register type aliases.
      factory.defs.forEach((definition: Definition) => {
        const name = definition.name;
        switch (definition.kind) {
          case 'alias':
            logger.debug(`Registering type alias ${name}...`);
            if (definition.definition != null) {
              this._typeRegistry.registerAlias(
                name, definition.location, (definition.definition: Type));
            }
            break;
          case 'function':
            // Register module-level functions.
            const functionName = service.preserveFunctionNames
              ? name : `${service.name}/${name}`;
            this._registerFunction(functionName, localImpl[name], definition.type);
            break;
          case 'interface':
            // Register interfaces.
            logger.debug(`Registering interface ${name}...`);
            this._classesByName.set(name, {
              localImplementation: localImpl[name],
              definition,
            });

            this._typeRegistry.registerType(
              name,
              definition.location,
              (object, context: ObjectRegistry) => context.marshal(name, object),
              (objectId, context: ObjectRegistry) =>
                context.unmarshal(objectId, context.getService(service.name)[name]));

            // Register all of the static methods as remote functions.
            definition.staticMethods.forEach((funcType, funcName) => {
              this._registerFunction(`${name}/${funcName}`, localImpl[name][funcName], funcType);
            });
            break;
        }
      });

    } catch (e) {
      logger.error(`Failed to load service ${service.name}. Stack Trace:\n${e.stack}`);
      throw e;
    }
  }

  _registerFunction(name: string, localImpl: Function, type: FunctionType): void {
    logger.debug(`Registering function ${name}...`);
    if (this._functionsByName.has(name)) {
      throw new Error(`Duplicate RPC function: ${name}`);
    }
    this._functionsByName.set(name, {
      localImplementation: localImpl,
      type,
    });
  }

  getFunctionImplemention(name: string): FunctionImplementation {
    const result = this._functionsByName.get(name);
    invariant(result);
    return result;
  }

  getClassDefinition(className: string): ClassDefinition {
    const result = this._classesByName.get(className);
    invariant(result != null);
    return result;
  }

  getTypeRegistry(): TypeRegistry {
    return this._typeRegistry;
  }

  getServices(): Iterator<ServiceDefinition> {
    return this._services.values();
  }

  hasService(serviceName: string): boolean {
    return this._services.has(serviceName);
  }

  getService(serviceName: string): ServiceDefinition {
    const result = this._services.get(serviceName);
    invariant(result != null);
    return result;
  }
}
