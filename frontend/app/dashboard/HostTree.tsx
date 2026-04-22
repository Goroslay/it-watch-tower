'use client';
import { useEffect, useState } from 'react';
import { fetchHostsInfo, type HostInfo } from '../../lib/api';

interface TreeNode {
  clientId: string | null;
  clientName: string;
  envs: {
    envId: string | null;
    envName: string;
    envType: string;
    hosts: HostInfo[];
  }[];
}

function buildTree(hosts: HostInfo[]): TreeNode[] {
  const clientMap = new Map<string, TreeNode>();
  for (const h of hosts) {
    const cKey = h.client_id ?? '__none__';
    const cName = h.client_name ?? 'Sin cliente';
    if (!clientMap.has(cKey)) {
      clientMap.set(cKey, { clientId: h.client_id, clientName: cName, envs: [] });
    }
    const node = clientMap.get(cKey)!;
    const eKey = h.env_id ?? '__none__';
    let env = node.envs.find((e) => e.envId === (h.env_id ?? '__none__'));
    if (!env) {
      env = { envId: eKey, envName: h.env_name ?? 'Sin entorno', envType: h.env_type ?? '', hosts: [] };
      node.envs.push(env);
    }
    env.hosts.push(h);
  }
  return Array.from(clientMap.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
}

const STATUS_DOT: Record<string, string> = {
  online:  'bg-green-400',
  offline: 'bg-red-400',
};

export default function HostTree({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (hostname: string) => void;
}) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchHostsInfo()
      .then((hosts) => setTree(buildTree(hosts)))
      .catch(() => undefined);
    const id = setInterval(() => {
      fetchHostsInfo()
        .then((hosts) => setTree(buildTree(hosts)))
        .catch(() => undefined);
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (tree.length === 0) {
    return <p className="text-gray-500 text-xs px-3 pt-4">Sin hosts registrados</p>;
  }

  return (
    <nav className="text-sm select-none">
      {tree.map((client) => {
        const cKey = client.clientId ?? '__none__';
        const cOpen = !collapsed.has(cKey);
        return (
          <div key={cKey} className="mb-1">
            {/* Client header */}
            <button
              onClick={() => toggle(cKey)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-700/40 rounded transition-colors text-xs font-semibold uppercase tracking-wide"
            >
              <span className="text-gray-600">{cOpen ? '▾' : '▸'}</span>
              <span className="truncate">{client.clientName}</span>
            </button>

            {cOpen && client.envs.map((env) => {
              const eKey = `${cKey}:${env.envId}`;
              const eOpen = !collapsed.has(eKey);
              return (
                <div key={eKey} className="ml-3">
                  {/* Environment header */}
                  <button
                    onClick={() => toggle(eKey)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-gray-500 hover:text-gray-300 hover:bg-gray-700/30 rounded transition-colors text-xs"
                  >
                    <span className="text-gray-600">{eOpen ? '▾' : '▸'}</span>
                    <span className="truncate">{env.envName}</span>
                    {env.envType && (
                      <span className="ml-auto text-gray-600 font-normal">{env.envType}</span>
                    )}
                  </button>

                  {eOpen && env.hosts.map((h) => (
                    <button
                      key={h.hostname}
                      onClick={() => onSelect(h.hostname)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 ml-2 rounded transition-colors text-xs ${
                        selected === h.hostname
                          ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                          : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[h.status] ?? 'bg-gray-500'}`} />
                      <span className="truncate font-mono">{h.hostname}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
