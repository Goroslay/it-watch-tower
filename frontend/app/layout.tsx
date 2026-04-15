export const metadata = {
  title: 'IT Watch Tower Dashboard',
  description: 'Enterprise monitoring and operations platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <nav className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold text-gray-900">IT Watch Tower</h1>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
