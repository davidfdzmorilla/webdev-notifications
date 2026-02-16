import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationTemplates } from '@/lib/db/schema';
import { z } from 'zod';

const createTemplateSchema = z.object({
  channel: z.enum(['email', 'sms', 'push', 'in_app']),
  eventType: z.string(),
  subject: z.string().nullable().optional(),
  body: z.string(),
  variables: z.array(z.string()).default([]),
});

/**
 * GET /api/admin/templates
 * List all notification templates
 *
 * Authentication: Admin only
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: Add admin authentication check
    const adminKey = request.headers.get('x-admin-key');
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templates = await db.select().from(notificationTemplates);

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/templates
 * Create a new notification template
 */
export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get('x-admin-key');
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createTemplateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const [template] = await db.insert(notificationTemplates).values(validation.data).returning();

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
