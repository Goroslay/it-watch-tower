import { NextResponse } from 'next/server';

// TODO: Implement API proxy to backend services
// GET /api/health - service health
// GET /api/hosts - list hosts
// GET /api/services - list services
// GET /api/metrics - query metrics
// GET /api/logs - search logs
// GET /api/alerts - list alerts

export async function GET() {
  return NextResponse.json({ message: 'API routes - Not yet implemented' });
}
