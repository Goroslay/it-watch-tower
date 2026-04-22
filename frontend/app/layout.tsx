import './globals.css';

export const metadata = {
  title: 'IT Watch Tower',
  description: 'Monitoreo de infraestructura',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-950 text-white">{children}</body>
    </html>
  );
}
