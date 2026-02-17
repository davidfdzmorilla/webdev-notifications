import { NextRequest, NextResponse } from 'next/server';
import { getMetrics, metricsRegistry } from '../../../lib/metrics';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Optional: protect metrics endpoint with a token
  const authHeader = request.headers.get('authorization');
  const metricsToken = process.env.METRICS_TOKEN;

  if (metricsToken && authHeader !== `Bearer ${metricsToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const metrics = await getMetrics();
    const contentType = metricsRegistry.contentType;

    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to collect metrics',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
