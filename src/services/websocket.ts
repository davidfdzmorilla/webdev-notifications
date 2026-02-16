import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { getRedisClient } from '../lib/redis';

const PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : 3001;

export class WebSocketServer {
  private io: SocketIOServer;
  private httpServer: ReturnType<typeof createServer>;
  private redis = getRedisClient();
  private connectedUsers = new Map<string, Set<string>>(); // userId -> Set<socketId>

  constructor() {
    this.httpServer = createServer();
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*', // Configure properly in production
        methods: ['GET', 'POST'],
      },
    });

    this.setupHandlers();
    this.subscribeToNotifications();
  }

  private setupHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Authentication required
      socket.on('authenticate', async (data: { userId: string; token?: string }) => {
        try {
          // TODO: Verify token in production
          const { userId } = data;

          if (!userId) {
            socket.emit('auth:error', { message: 'userId required' });
            socket.disconnect();
            return;
          }

          // Store user connection
          if (!this.connectedUsers.has(userId)) {
            this.connectedUsers.set(userId, new Set());
          }
          this.connectedUsers.get(userId)!.add(socket.id);

          // Join user's personal room
          await socket.join(`user:${userId}`);

          // Store in Redis for distributed setup
          await this.redis.sadd(`ws:users:${userId}`, socket.id);
          await this.redis.set(`ws:socket:${socket.id}`, userId, { EX: 86400 });

          socket.emit('auth:success', { userId, socketId: socket.id });
          console.log(`✅ User ${userId} authenticated (${socket.id})`);

          // Send pending notifications count
          const unreadCount = await this.getUnreadCount(userId);
          socket.emit('notifications:unread', { count: unreadCount });
        } catch (error) {
          console.error('Authentication error:', error);
          socket.emit('auth:error', { message: 'Authentication failed' });
          socket.disconnect();
        }
      });

      // Subscribe to notifications
      socket.on('subscribe', async (data: { userId: string }) => {
        const { userId } = data;
        if (!userId) {
          return;
        }

        await socket.join(`user:${userId}`);
        console.log(`📡 User ${userId} subscribed to notifications`);
      });

      // Mark notification as read
      socket.on('markRead', async (data: { notificationId: string; userId: string }) => {
        try {
          const { notificationId, userId } = data;
          console.log(`✓ Marking notification ${notificationId} as read for user ${userId}`);

          // TODO: Update database to mark as read
          // For now, just acknowledge
          socket.emit('notification:read', { notificationId });
        } catch (error) {
          console.error('Error marking read:', error);
          socket.emit('error', { message: 'Failed to mark as read' });
        }
      });

      // Disconnect
      socket.on('disconnect', async () => {
        try {
          const userId = await this.redis.get(`ws:socket:${socket.id}`);
          if (userId) {
            // Remove from connected users
            const sockets = this.connectedUsers.get(userId);
            if (sockets) {
              sockets.delete(socket.id);
              if (sockets.size === 0) {
                this.connectedUsers.delete(userId);
              }
            }

            // Remove from Redis
            await this.redis.srem(`ws:users:${userId}`, socket.id);
            await this.redis.del(`ws:socket:${socket.id}`);
            console.log(`👋 User ${userId} disconnected (${socket.id})`);
          } else {
            console.log(`👋 Client disconnected: ${socket.id}`);
          }
        } catch (error) {
          console.error('Error handling disconnect:', error);
        }
      });
    });
  }

  /**
   * Subscribe to Redis pub/sub for new notifications
   */
  private async subscribeToNotifications() {
    // Create a separate Redis client for pub/sub
    const subscriber = getRedisClient().duplicate();
    await subscriber.connect();

    await subscriber.subscribe('ws:notifications', (message) => {
      try {
        const data = JSON.parse(message);
        const { userId, notification } = data;

        // Send to user's room
        this.sendToUser(userId, 'notification:new', notification);
      } catch (error) {
        console.error('Error processing notification broadcast:', error);
      }
    });

    console.log('📡 Subscribed to ws:notifications channel');
  }

  /**
   * Broadcast notification to a specific user
   */
  async sendToUser(userId: string, event: string, data: unknown) {
    this.io.to(`user:${userId}`).emit(event, data);
    console.log(`📤 Sent ${event} to user ${userId}`);
  }

  /**
   * Broadcast to all connected users
   */
  broadcast(event: string, data: unknown) {
    this.io.emit(event, data);
    console.log(`📡 Broadcasted ${event} to all users`);
  }

  /**
   * Get online users count
   */
  getOnlineUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Get unread notification count for user
   */
  private async getUnreadCount(_userId: string): Promise<number> {
    // TODO: Query database for unread notifications
    // For now, return 0
    return 0;
  }

  /**
   * Start the WebSocket server
   */
  async start() {
    return new Promise<void>((resolve) => {
      this.httpServer.listen(PORT, () => {
        console.log(`🚀 WebSocket server running on port ${PORT}`);
        console.log(`   ws://localhost:${PORT}`);
        resolve();
      });
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop() {
    console.log('🛑 Stopping WebSocket server...');
    this.io.close();
    this.httpServer.close();
  }

  /**
   * Get the Socket.IO server instance
   */
  getIO(): SocketIOServer {
    return this.io;
  }
}

// Standalone runner
if (require.main === module) {
  const server = new WebSocketServer();

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  server.start().catch((err) => {
    console.error('❌ WebSocket server failed:', err);
    process.exit(1);
  });
}

// Export singleton instance for workers to use
let wsInstance: WebSocketServer | null = null;

export function getWebSocketServer(): WebSocketServer {
  if (!wsInstance) {
    wsInstance = new WebSocketServer();
  }
  return wsInstance;
}
