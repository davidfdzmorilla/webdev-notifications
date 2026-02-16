import { NextRequest, NextResponse } from 'next/server';
import { getJetStream } from '@/lib/nats';
import { notificationEventSchema } from '@/types';
import { nanoid } from 'nanoid';

/**
 * POST /api/events
 * Submit a notification event for processing
 *
 * Authentication: API key (X-API-Key header)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = notificationEventSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    // Generate event ID if not provided
    const event = {
      ...validation.data,
      eventId: validation.data.eventId || nanoid(),
      createdAt: new Date().toISOString(),
    };

    // Publish to NATS
    const js = await getJetStream();
    const data = new TextEncoder().encode(JSON.stringify(event));
    await js.publish('notifications.events', data);

    return NextResponse.json(
      {
        success: true,
        eventId: event.eventId,
        message: 'Event submitted for processing',
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Error submitting event:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
