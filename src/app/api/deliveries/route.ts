import { NextRequest, NextResponse } from 'next/server';
import { AnalyticsService } from '@/services/analytics';

/**
 * GET /api/deliveries?userId=xxx&limit=50
 * List user's notification deliveries
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const analytics = new AnalyticsService();
    const deliveries = await analytics.getUserDeliveries(userId, limit);

    return NextResponse.json({ deliveries });
  } catch (error) {
    console.error('Error fetching deliveries:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
