/**
 * Host/Infrastructure definition
 */
export interface Host {
  id: string;
  name: string;
  hostname: string;
  ip: string;
  platform: string;
  arch: string;
  agentVersion: string;
  lastHeartbeat: number;
  status: 'online' | 'offline' | 'unknown';
  createdAt: number;
  updatedAt: number;
}

/**
 * Service running on a host
 */
export interface Service {
  id: string;
  hostId: string;
  name: string;
  type: string; // nginx, tomcat, wildfly, node, oracle, etc.
  port?: number;
  status: 'running' | 'stopped' | 'unknown';
  pid?: number;
  version?: string;
  lastHeartbeat: number;
  createdAt: number;
  updatedAt: number;
}
