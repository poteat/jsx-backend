/**
 * Example: A complete REST API using JSX Backend
 *
 * This demonstrates how React/JSX semantics can be used to define
 * an HTTP server in a declarative, component-based way.
 *
 * Run with: npm start
 */

import React from "react";
import {
  render,
  Server,
  Router,
  Route,
  Get,
  Post,
  Put,
  Delete,
  Middleware,
  Resource,
  Api,
  HealthCheck,
  NotFound,
  ErrorBoundary,
} from "./index.js";
import type { Request, Response, NextFunction, RouteHandler } from "./types.js";

// ============================================================================
// Simulated Database
// ============================================================================

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface Post {
  id: string;
  userId: string;
  title: string;
  content: string;
  createdAt: string;
}

const db = {
  users: new Map<string, User>([
    ["1", { id: "1", name: "Alice", email: "alice@example.com", createdAt: new Date().toISOString() }],
    ["2", { id: "2", name: "Bob", email: "bob@example.com", createdAt: new Date().toISOString() }],
  ]),
  posts: new Map<string, Post>([
    ["1", { id: "1", userId: "1", title: "Hello World", content: "My first post!", createdAt: new Date().toISOString() }],
  ]),
  nextUserId: 3,
  nextPostId: 2,
};

// ============================================================================
// Middleware
// ============================================================================

/**
 * Request logging middleware
 */
const loggerMiddleware: RouteHandler = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
};

/**
 * Simple auth middleware (demo purposes)
 */
const authMiddleware: RouteHandler = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    // For demo, we'll be lenient
    (req as any).user = null;
  } else {
    // Simulate token validation
    (req as any).user = { id: "1", role: "admin" };
  }

  next();
};

/**
 * Require authentication middleware
 */
const requireAuth: RouteHandler = (req, res, next) => {
  if (!(req as any).user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
};

// ============================================================================
// Route Handlers
// ============================================================================

// Users handlers
const listUsers: RouteHandler = (req, res) => {
  res.json(Array.from(db.users.values()));
};

const getUser: RouteHandler = (req, res) => {
  const user = db.users.get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
};

const createUser: RouteHandler = (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    res.status(400).json({ error: "Name and email are required" });
    return;
  }

  const id = String(db.nextUserId++);
  const user: User = {
    id,
    name,
    email,
    createdAt: new Date().toISOString(),
  };

  db.users.set(id, user);
  res.status(201).json(user);
};

const updateUser: RouteHandler = (req, res) => {
  const user = db.users.get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const updated = { ...user, ...req.body, id: user.id };
  db.users.set(user.id, updated);
  res.json(updated);
};

const deleteUser: RouteHandler = (req, res) => {
  if (!db.users.has(req.params.id)) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  db.users.delete(req.params.id);
  res.status(204).end();
};

// Posts handlers
const listPosts: RouteHandler = (req, res) => {
  res.json(Array.from(db.posts.values()));
};

const getPost: RouteHandler = (req, res) => {
  const post = db.posts.get(req.params.id);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(post);
};

const createPost: RouteHandler = (req, res) => {
  const { userId, title, content } = req.body;

  if (!userId || !title) {
    res.status(400).json({ error: "userId and title are required" });
    return;
  }

  const id = String(db.nextPostId++);
  const post: Post = {
    id,
    userId,
    title,
    content: content || "",
    createdAt: new Date().toISOString(),
  };

  db.posts.set(id, post);
  res.status(201).json(post);
};

// User's posts (nested resource)
const getUserPosts: RouteHandler = (req, res) => {
  const posts = Array.from(db.posts.values()).filter(
    (p) => p.userId === req.params.userId
  );
  res.json(posts);
};

// ============================================================================
// Component-Based Route Organization
// ============================================================================

/**
 * Demonstrates composing routes as reusable components
 */
function UserRoutes(): React.ReactElement {
  return (
    <Resource
      path="/users"
      list={listUsers}
      get={getUser}
      create={createUser}
      update={updateUser}
      remove={deleteUser}
    >
      {/* Nested route: /api/v1/users/:userId/posts */}
      <Route path="/:userId/posts">
        <Get handler={getUserPosts} />
      </Route>
    </Resource>
  );
}

/**
 * Posts routes as a component
 */
function PostRoutes(): React.ReactElement {
  return (
    <Route path="/posts">
      <Get handler={listPosts} />
      <Post handler={createPost} />
      <Route path="/:id">
        <Get handler={getPost} />
      </Route>
    </Route>
  );
}

/**
 * Admin routes - protected by auth
 */
function AdminRoutes(): React.ReactElement {
  return (
    <Router path="/admin">
      <Middleware handler={requireAuth}>
        <Get
          path="/stats"
          handler={(req, res) => {
            res.json({
              userCount: db.users.size,
              postCount: db.posts.size,
            });
          }}
        />
        <Get
          path="/users"
          handler={(req, res) => {
            res.json({
              users: Array.from(db.users.values()),
              total: db.users.size,
            });
          }}
        />
      </Middleware>
    </Router>
  );
}

// ============================================================================
// Main Application
// ============================================================================

/**
 * The main application component
 *
 * Notice how this feels like building a React component tree,
 * but it's actually defining an HTTP API!
 */
function App(): React.ReactElement {
  return (
    <Server port={3000}>
      {/* Global middleware */}
      <Middleware handler={loggerMiddleware}>
        <Middleware handler={authMiddleware}>
          {/* Root endpoint */}
          <Get
            path="/"
            handler={(req, res) => {
              res.json({
                message: "Welcome to JSX Backend!",
                docs: "/api/v1",
                health: "/health",
              });
            }}
          />

          {/* Health check */}
          <HealthCheck
            path="/health"
            checks={{
              database: () => true, // Simulated check
              memory: () => process.memoryUsage().heapUsed < 500 * 1024 * 1024,
            }}
          />

          {/* API v1 with CORS */}
          <Api path="/api/v1" cors>
            <ErrorBoundary
              fallback={(err, req, res) => {
                console.error("API Error:", err);
                res.status(500).json({
                  error: "Internal server error",
                  message: err.message,
                });
              }}
            >
              <UserRoutes />
              <PostRoutes />
            </ErrorBoundary>
          </Api>

          {/* Admin routes */}
          <AdminRoutes />

          {/* 404 handler (must be last) */}
          <NotFound message="Endpoint not found" />
        </Middleware>
      </Middleware>
    </Server>
  );
}

// ============================================================================
// Bootstrap
// ============================================================================

console.log("Starting JSX Backend server...\n");

// Render the JSX tree into an Express app
const { app } = render(<App />);

// Start listening
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    JSX Backend Server                       ║
╠════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT.toString().padEnd(23)}║
║                                                            ║
║  Try these endpoints:                                      ║
║    GET  /                    - Welcome message             ║
║    GET  /health              - Health check                ║
║    GET  /api/v1/users        - List all users              ║
║    GET  /api/v1/users/1      - Get user by ID              ║
║    POST /api/v1/users        - Create a user               ║
║    GET  /api/v1/users/1/posts - Get user's posts           ║
║    GET  /api/v1/posts        - List all posts              ║
║    GET  /admin/stats         - Admin stats (needs auth)    ║
╚════════════════════════════════════════════════════════════╝
`);
});
