#!/usr/bin/env tsx
import { db } from './index';
import { users, notificationPreferences, notificationTemplates } from './schema';

async function seed() {
  console.log('🌱 Seeding database...');

  // Create sample users
  const sampleUsers = [
    {
      email: 'alice@example.com',
      phone: '+1234567890',
      pushTokens: ['token_alice_web', 'token_alice_mobile'],
    },
    {
      email: 'bob@example.com',
      phone: '+1234567891',
      pushTokens: ['token_bob_web'],
    },
    {
      email: 'charlie@example.com',
      pushTokens: [],
    },
  ];

  console.log('Creating users...');
  const createdUsers = await db.insert(users).values(sampleUsers).onConflictDoNothing().returning();
  console.log(`✅ Created ${createdUsers.length} users`);

  // Create default preferences for each user
  const preferences = [];
  const channels = ['email', 'sms', 'push', 'in_app'] as const;
  const eventTypes = ['account', 'security', 'marketing', 'system'] as const;

  for (const user of createdUsers) {
    for (const channel of channels) {
      for (const eventType of eventTypes) {
        preferences.push({
          userId: user.id,
          channel,
          eventType,
          enabled: eventType === 'marketing' ? false : true, // Marketing disabled by default
          quietHoursStart: eventType === 'marketing' ? '22:00:00' : null,
          quietHoursEnd: eventType === 'marketing' ? '08:00:00' : null,
        });
      }
    }
  }

  console.log('Creating preferences...');
  const createdPreferences = await db
    .insert(notificationPreferences)
    .values(preferences)
    .onConflictDoNothing()
    .returning();
  console.log(`✅ Created ${createdPreferences.length} preferences`);

  // Create notification templates
  const templates = [
    // Email templates
    {
      channel: 'email',
      eventType: 'account',
      subject: 'Welcome to {{appName}}!',
      body: 'Hi {{userName}},\n\nWelcome to our platform! Click here to get started: {{actionUrl}}',
      variables: ['appName', 'userName', 'actionUrl'],
    },
    {
      channel: 'email',
      eventType: 'security',
      subject: 'Security Alert: {{alertType}}',
      body: 'Hi {{userName}},\n\nWe detected {{alertType}} on your account. If this was you, no action is needed. Otherwise, secure your account immediately: {{actionUrl}}',
      variables: ['userName', 'alertType', 'actionUrl'],
    },
    {
      channel: 'email',
      eventType: 'marketing',
      subject: '{{campaignName}} - Special Offer!',
      body: 'Hi {{userName}},\n\n{{campaignMessage}}\n\nCheck it out: {{actionUrl}}',
      variables: ['userName', 'campaignName', 'campaignMessage', 'actionUrl'],
    },
    {
      channel: 'email',
      eventType: 'system',
      subject: 'System Notification: {{title}}',
      body: 'Hi {{userName}},\n\n{{message}}',
      variables: ['userName', 'title', 'message'],
    },
    // SMS templates
    {
      channel: 'sms',
      eventType: 'account',
      body: '{{appName}}: Welcome {{userName}}! Verify your account: {{actionUrl}}',
      variables: ['appName', 'userName', 'actionUrl'],
    },
    {
      channel: 'sms',
      eventType: 'security',
      body: "Security Alert: {{alertType}}. If this wasn't you, secure your account: {{actionUrl}}",
      variables: ['alertType', 'actionUrl'],
    },
    // Push templates
    {
      channel: 'push',
      eventType: 'account',
      subject: 'Welcome!',
      body: 'Thanks for joining {{appName}}, {{userName}}!',
      variables: ['appName', 'userName'],
    },
    {
      channel: 'push',
      eventType: 'security',
      subject: 'Security Alert',
      body: '{{alertType}} detected. Tap to review.',
      variables: ['alertType'],
    },
    // In-app templates
    {
      channel: 'in_app',
      eventType: 'account',
      body: 'Welcome {{userName}}! Get started with our quick tour.',
      variables: ['userName'],
    },
    {
      channel: 'in_app',
      eventType: 'system',
      body: '{{message}}',
      variables: ['message'],
    },
  ];

  console.log('Creating templates...');
  const createdTemplates = await db
    .insert(notificationTemplates)
    .values(templates)
    .onConflictDoNothing()
    .returning();
  console.log(`✅ Created ${createdTemplates.length} templates`);

  console.log('\n🎉 Database seeded successfully!');
  console.log(`  Users: ${createdUsers.length}`);
  console.log(`  Preferences: ${createdPreferences.length}`);
  console.log(`  Templates: ${createdTemplates.length}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
