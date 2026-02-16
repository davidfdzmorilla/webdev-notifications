import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationPreferences } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const createPreferenceSchema = z.object({
  userId: z.string(),
  channel: z.enum(['email', 'sms', 'push', 'in_app']),
  eventType: z.string(),
  enabled: z.boolean().default(true),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
});

/**
 * GET /api/preferences?userId=xxx
 * List user preferences
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const preferences = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/preferences
 * Create a new preference
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = createPreferenceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const [preference] = await db
      .insert(notificationPreferences)
      .values(validation.data)
      .returning();

    return NextResponse.json({ preference }, { status: 201 });
  } catch (error) {
    console.error('Error creating preference:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
