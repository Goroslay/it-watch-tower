'use client';

export default function DashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="w-full max-w-5xl">
        <h1 className="text-4xl font-bold mb-8">IT Watch Tower Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Infrastructure Overview */}
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-2xl font-semibold mb-4">Infrastructure</h2>
            <p className="text-gray-600">Hosts and services monitoring (TODO)</p>
          </div>

          {/* Metrics */}
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-2xl font-semibold mb-4">Metrics</h2>
            <p className="text-gray-600">System metrics and performance (TODO)</p>
          </div>

          {/* Logs */}
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-2xl font-semibold mb-4">Logs</h2>
            <p className="text-gray-600">Log search and analysis (TODO)</p>
          </div>

          {/* Alerts */}
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-2xl font-semibold mb-4">Alerts</h2>
            <p className="text-gray-600">Alert management (TODO)</p>
          </div>
        </div>
      </div>
    </main>
  );
}
