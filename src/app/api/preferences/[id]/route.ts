import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationPreferences } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updatePreferenceSchema = z.object({
  enabled: z.boolean().optional(),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
});

/**
 * GET /api/preferences/:id
 * Get a single preference by ID
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [preference] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.id, id))
      .limit(1);

    if (!preference) {
      return NextResponse.json({ error: 'Preference not found' }, { status: 404 });
    }

    return NextResponse.json({ preference });
  } catch (error) {
    console.error('Error fetching preference:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/preferences/:id
 * Update a preference
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = updatePreferenceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const [preference] = await db
      .update(notificationPreferences)
      .set({
        ...validation.data,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.id, id))
      .returning();

    if (!preference) {
      return NextResponse.json({ error: 'Preference not found' }, { status: 404 });
    }

    return NextResponse.json({ preference });
  } catch (error) {
    console.error('Error updating preference:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/preferences/:id
 * Delete a preference
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(notificationPreferences)
      .where(eq(notificationPreferences.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Preference not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting preference:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
