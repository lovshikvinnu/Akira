export interface ModuleEvents {
  publishes?: string[];
  subscribes?: string[];
}

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  sdkVersion: string;
  description: string;
  author: string;

  // Optional Fields
  homepage?: string;
  repository?: string;
  license?: string;
  permissions?: string[];
  dependencies?: string[];
  capabilities?: string[];
  routes?: string[];
  events?: ModuleEvents;
  startup?: string;
  shutdown?: string;
  enabled?: boolean;
}
