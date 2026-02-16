#!/bin/bash
set -e

echo "🚀 Starting full notification pipeline test..."

# Start all services and workers in background
echo "Starting ingestion service..."
pnpm ingestion > /tmp/test-ingestion.log 2>&1 &
ING_PID=$!

sleep 2

echo "Starting preferences engine..."
pnpm preferences > /tmp/test-preferences.log 2>&1 &
PREF_PID=$!

sleep 2

echo "Starting channel router..."
pnpm router > /tmp/test-router.log 2>&1 &
ROUTER_PID=$!

sleep 2

echo "Starting email worker..."
pnpm worker:email > /tmp/test-email.log 2>&1 &
EMAIL_PID=$!

echo "Starting SMS worker..."
pnpm worker:sms > /tmp/test-sms.log 2>&1 &
SMS_PID=$!

echo "Starting push worker..."
pnpm worker:push > /tmp/test-push.log 2>&1 &
PUSH_PID=$!

echo "Starting in-app worker..."
pnpm worker:inapp > /tmp/test-inapp.log 2>&1 &
INAPP_PID=$!

sleep 3

echo ""
echo "✅ All services running. Publishing test event..."
pnpm test:publish

echo ""
echo "⏳ Waiting for processing (10 seconds)..."
sleep 10

echo ""
echo "🛑 Stopping all services..."
kill $ING_PID $PREF_PID $ROUTER_PID $EMAIL_PID $SMS_PID $PUSH_PID $INAPP_PID 2>/dev/null || true

echo ""
echo "📊 Results:"
echo ""
echo "=== INGESTION ==="
tail -5 /tmp/test-ingestion.log
echo ""
echo "=== PREFERENCES ==="
tail -5 /tmp/test-preferences.log
echo ""
echo "=== ROUTER ==="
tail -10 /tmp/test-router.log
echo ""
echo "=== EMAIL WORKER ==="
tail -8 /tmp/test-email.log
echo ""
echo "=== SMS WORKER ==="
tail -5 /tmp/test-sms.log
echo ""
echo "=== PUSH WORKER ==="
tail -5 /tmp/test-push.log
echo ""
echo "=== IN-APP WORKER ==="
tail -5 /tmp/test-inapp.log

echo ""
echo "✅ Pipeline test complete!"
