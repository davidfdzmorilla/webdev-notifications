import { NextRequest, NextResponse } from 'next/server';
import { AnalyticsService } from '@/services/analytics';

/**
 * GET /api/deliveries/:id
 * Get delivery details by ID
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const analytics = new AnalyticsService();
    const delivery = await analytics.getDeliveryById(params.id);

    if (!delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 });
    }

    return NextResponse.json({ delivery });
  } catch (error) {
    console.error('Error fetching delivery:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
