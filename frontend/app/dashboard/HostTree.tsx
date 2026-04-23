'use client';
import { useEffect, useState } from 'react';
import { fetchHostsInfo, type HostInfo } from '../../lib/api';

type TreeMode = 'full' | 'client-host' | 'env-host';

const TREE_MODES: { key: TreeMode; label: string }[] = [
  { key: 'full',        label: 'Cliente / Entorno / Host' },
  { key: 'client-host', label: 'Cliente / Host' },
  { key: 'env-host',    label: 'Entorno / Host' },
];

interface ClientEnvNode {
  clientId: string | null;
  clientName: string;
  envs: {
    envId: string;
    envName: string;
    envType: string;
    hosts: HostInfo[];
  }[];
}

interface GroupNode {
  groupKey: string;
  groupName: string;
  hosts: HostInfo[];
}

function buildFullTree(hosts: HostInfo[]): ClientEnvNode[] {
  const clientMap = new Map<string, ClientEnvNode>();
  for (const h of hosts) {
    const cKey = h.client_id ?? '__none__';
    if (!clientMap.has(cKey)) {
      clientMap.set(cKey, { clientId: h.client_id, clientName: h.client_name ?? 'Sin cliente', envs: [] });
    }
    const node = clientMap.get(cKey)!;
    const eKey = h.env_id ?? '__none__';
    let env = node.envs.find((e) => e.envId === eKey);
    if (!env) {
      env = { envId: eKey, envName: h.env_name ?? 'Sin entorno', envType: h.env_type ?? '', hosts: [] };
      node.envs.push(env);
    }
    env.hosts.push(h);
  }
  return Array.from(clientMap.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
}

function buildGroupTree(hosts: HostInfo[], groupFn: (h: HostInfo) => [string, string]): GroupNode[] {
  const map = new Map<string, GroupNode>();
  for (const h of hosts) {
    const [key, name] = groupFn(h);
    if (!map.has(key)) map.set(key, { groupKey: key, groupName: name, hosts: [] });
    map.get(key)!.hosts.push(h);
  }
  return Array.from(map.values()).sort((a, b) => a.groupName.localeCompare(b.groupName));
}

const STATUS_DOT: Record<string, string> = {
  online:  'bg-green-400',
  offline: 'bg-red-400',
};

function HostBtn({ h, selected, onSelect }: { h: HostInfo; selected: string; onSelect: (h: HostInfo) => void }) {
  return (
    <button
      onClick={() => onSelect(h)}
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded transition-colors text-xs ${
        selected === h.hostname
          ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
          : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[h.status] ?? 'bg-gray-500'}`} />
      <span className="truncate font-mono">{h.hostname}</span>
    </button>
  );
}

export default function HostTree({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (info: HostInfo) => void;
}) {
  const [hosts, setHosts] = useState<HostInfo[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<TreeMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('hostTreeMode') as TreeMode) ?? 'full';
    }
    return 'full';
  });
  const [dropdown, setDropdown] = useState(false);

  useEffect(() => {
    const load = () => fetchHostsInfo().then(setHosts).catch(() => undefined);
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const changeMode = (m: TreeMode) => {
    setMode(m);
    localStorage.setItem('hostTreeMode', m);
    setDropdown(false);
    setCollapsed(new Set());
  };

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (hosts.length === 0) {
    return <p className="text-gray-500 text-xs px-3 pt-4">Sin hosts registrados</p>;
  }

  const currentModeLabel = TREE_MODES.find((m) => m.key === mode)?.label ?? '';

  return (
    <nav className="text-sm select-none">
      {/* Hierarchy mode selector */}
      <div className="relative px-2 pb-2">
        <button
          onClick={() => setDropdown((v) => !v)}
          className="w-full text-left text-xs text-gray-500 hover:text-gray-300 flex items-center justify-between px-2 py-1 rounded hover:bg-gray-700/30 transition-colors"
        >
          <span className="truncate">{currentModeLabel}</span>
          <span className="text-gray-600 ml-1 flex-shrink-0">{dropdown ? '▴' : '▾'}</span>
        </button>
        {dropdown && (
          <div className="absolute left-2 right-2 mt-0.5 bg-gray-800 border border-gray-700 rounded shadow-lg z-20">
            {TREE_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => changeMode(m.key)}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  mode === m.key ? 'text-blue-300 bg-blue-900/30' : 'text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Full: Client > Env > Host */}
      {mode === 'full' && buildFullTree(hosts).map((client) => {
        const cKey = client.clientId ?? '__none__';
        const cOpen = !collapsed.has(cKey);
        return (
          <div key={cKey} className="mb-1">
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
                  <button
                    onClick={() => toggle(eKey)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-gray-500 hover:text-gray-300 hover:bg-gray-700/30 rounded transition-colors text-xs"
                  >
                    <span className="text-gray-600">{eOpen ? '▾' : '▸'}</span>
                    <span className="truncate">{env.envName}</span>
                    {env.envType && <span className="ml-auto text-gray-600">{env.envType}</span>}
                  </button>
                  {eOpen && env.hosts.map((h) => (
                    <div key={h.hostname} className="ml-2">
                      <HostBtn h={h} selected={selected} onSelect={onSelect} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Client/Host: Client > Host */}
      {mode === 'client-host' && buildGroupTree(
        hosts, (h) => [h.client_id ?? '__none__', h.client_name ?? 'Sin cliente'],
      ).map((group) => {
        const gOpen = !collapsed.has(group.groupKey);
        return (
          <div key={group.groupKey} className="mb-1">
            <button
              onClick={() => toggle(group.groupKey)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-700/40 rounded transition-colors text-xs font-semibold uppercase tracking-wide"
            >
              <span className="text-gray-600">{gOpen ? '▾' : '▸'}</span>
              <span className="truncate">{group.groupName}</span>
            </button>
            {gOpen && group.hosts.map((h) => (
              <div key={h.hostname} className="ml-3">
                <HostBtn h={h} selected={selected} onSelect={onSelect} />
              </div>
            ))}
          </div>
        );
      })}

      {/* Env/Host: Env > Host */}
      {mode === 'env-host' && buildGroupTree(
        hosts, (h) => [h.env_id ?? '__none__', h.env_name ?? 'Sin entorno'],
      ).map((group) => {
        const gOpen = !collapsed.has(group.groupKey);
        return (
          <div key={group.groupKey} className="mb-1">
            <button
              onClick={() => toggle(group.groupKey)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-700/40 rounded transition-colors text-xs font-semibold uppercase tracking-wide"
            >
              <span className="text-gray-600">{gOpen ? '▾' : '▸'}</span>
              <span className="truncate">{group.groupName}</span>
            </button>
            {gOpen && group.hosts.map((h) => (
              <div key={h.hostname} className="ml-3">
                <HostBtn h={h} selected={selected} onSelect={onSelect} />
              </div>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
