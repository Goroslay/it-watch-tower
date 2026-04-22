'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '../../lib/store';
import { jwtDecode } from 'jwt-decode';

interface TokenPayload {
  role: string;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, init } = useAuthStore();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (token === null) return;
    if (!token) { router.replace('/login'); return; }
    try {
      const payload = jwtDecode<TokenPayload>(token);
      if (payload.role !== 'admin') router.replace('/dashboard');
    } catch {
      router.replace('/login');
    }
  }, [token, router]);

  const links = [
    { href: '/admin/clients', label: 'Clientes' },
    { href: '/admin/environments', label: 'Ambientes' },
    { href: '/admin/users', label: 'Usuarios' },
    { href: '/admin/hosts', label: 'Hosts' },
    { href: '/admin/alert-rules', label: 'Alertas' },
    { href: '/admin/audit', label: 'Audit Log' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-blue-400 text-sm tracking-widest uppercase">Admin</span>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`text-sm px-3 py-1 rounded transition-colors ${
              pathname.startsWith(l.href)
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {l.label}
          </Link>
        ))}
        <div className="ml-auto flex gap-3">
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
            ← Dashboard
          </Link>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
