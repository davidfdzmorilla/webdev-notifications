import { NextRequest, NextResponse } from 'next/server';
import { AnalyticsService } from '@/services/analytics';

/**
 * GET /api/deliveries/stats?period=24
 * Get delivery analytics and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '24', 10);

    const analytics = new AnalyticsService();
    const stats = await analytics.getAnalytics(period);

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
