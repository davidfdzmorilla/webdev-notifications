import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateTemplateSchema = z.object({
  subject: z.string().nullable().optional(),
  body: z.string().optional(),
  variables: z.array(z.string()).optional(),
});

/**
 * PATCH /api/admin/templates/:id
 * Update a notification template
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const adminKey = request.headers.get('x-admin-key');
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = updateTemplateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const [template] = await db
      .update(notificationTemplates)
      .set({
        ...validation.data,
        updatedAt: new Date(),
      })
      .where(eq(notificationTemplates.id, params.id))
      .returning();

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/templates/:id
 * Delete a notification template
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const adminKey = request.headers.get('x-admin-key');
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [deleted] = await db
      .delete(notificationTemplates)
      .where(eq(notificationTemplates.id, params.id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
