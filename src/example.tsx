/**
 * Example: Component-Based REST API using JSX Backend
 *
 * This demonstrates how both routes AND responses can be defined
 * as React component trees. Responses "render" to JSON.
 *
 * Run with: npm start
 */

import React from "react";
import {
  // Server/routing components
  render,
  Server,
  Route,
  Get,
  Post,
  Put,
  Delete,
  Middleware,
  Api,
  // Response components
  Object,
  Array,
  Field,
  Literal,
  Status,
  When,
  Match,
  Case,
  Default,
  ErrorResponse,
  NotFoundResponse,
  CreatedResponse,
  // Hooks
  useParams,
  useQuery,
  useBody,
  // Route helpers for better type inference
  get,
  post,
  route,
} from "./index.js";
import { z, ZodGet, ZodPost, ZodPut, ZodDelete, getApiSchemas } from "./zod.js";
import {
  input,
  GET,
  POST,
  PUT,
  DELETE as DEL,
  getEndpointSchemas,
  generateApiClient,
} from "./endpoint.js";
import type { RouteHandler } from "./types.js";

// ============================================================================
// Simulated Database
// ============================================================================

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user" | "guest";
  createdAt: string;
}

interface Post {
  id: string;
  userId: string;
  title: string;
  content: string;
  published: boolean;
  createdAt: string;
}

const db = {
  users: new Map<string, User>([
    ["1", { id: "1", name: "Alice", email: "alice@example.com", role: "admin", createdAt: new Date().toISOString() }],
    ["2", { id: "2", name: "Bob", email: "bob@example.com", role: "user", createdAt: new Date().toISOString() }],
    ["3", { id: "3", name: "Charlie", email: "charlie@example.com", role: "guest", createdAt: new Date().toISOString() }],
  ]),
  posts: new Map<string, Post>([
    ["1", { id: "1", userId: "1", title: "Hello World", content: "My first post!", published: true, createdAt: new Date().toISOString() }],
    ["2", { id: "2", userId: "1", title: "Draft Post", content: "Work in progress...", published: false, createdAt: new Date().toISOString() }],
  ]),
  nextUserId: 4,
  nextPostId: 3,
};

// ============================================================================
// Response Components - Reusable "templates" for JSON responses
// ============================================================================

/**
 * A single user rendered as a JSON object.
 * This is a reusable component that can be used anywhere.
 */
function UserObject({ user }: { user: User }) {
  return (
    <Object>
      <Field name="id">{user.id}</Field>
      <Field name="name">{user.name}</Field>
      <Field name="email">{user.email}</Field>
      <Field name="role">{user.role}</Field>
      <Field name="createdAt">{user.createdAt}</Field>
    </Object>
  );
}

/**
 * User summary - a lighter version with fewer fields
 */
function UserSummary({ user }: { user: User }) {
  return (
    <Object>
      <Field name="id">{user.id}</Field>
      <Field name="name">{user.name}</Field>
    </Object>
  );
}

/**
 * A post rendered as JSON, with optional author embedding
 */
function PostObject({ post, includeAuthor = false }: { post: Post; includeAuthor?: boolean }) {
  const author = db.users.get(post.userId);

  return (
    <Object>
      <Field name="id">{post.id}</Field>
      <Field name="title">{post.title}</Field>
      <Field name="content">{post.content}</Field>
      <Field name="published">{post.published}</Field>
      <Field name="createdAt">{post.createdAt}</Field>
      <When condition={includeAuthor && author !== undefined}>
        <Field name="author">
          <UserSummary user={author!} />
        </Field>
      </When>
    </Object>
  );
}

/**
 * Paginated list wrapper
 */
function PaginatedList<T>({
  items,
  page,
  pageSize,
  renderItem,
}: {
  items: T[];
  page: number;
  pageSize: number;
  renderItem: (item: T) => React.ReactElement;
}) {
  const start = (page - 1) * pageSize;
  const paginatedItems = items.slice(start, start + pageSize);
  const totalPages = Math.ceil(items.length / pageSize);

  return (
    <Object>
      <Field name="data">
        <Array>
          {paginatedItems.map(renderItem)}
        </Array>
      </Field>
      <Field name="pagination">
        <Object>
          <Field name="page">{page}</Field>
          <Field name="pageSize">{pageSize}</Field>
          <Field name="total">{items.length}</Field>
          <Field name="totalPages">{totalPages}</Field>
        </Object>
      </Field>
    </Object>
  );
}

// ============================================================================
// Route Response Components - These access request context via hooks
// ============================================================================

/**
 * GET /users - List all users with pagination
 */
function ListUsersResponse() {
  const query = useQuery<{ page?: string; limit?: string }>();
  const page = parseInt(query.page || "1");
  const limit = parseInt(query.limit || "10");

  const users = globalThis.Array.from(db.users.values());

  return (
    <PaginatedList
      items={users}
      page={page}
      pageSize={limit}
      renderItem={(user) => <UserObject key={user.id} user={user} />}
    />
  );
}

/**
 * GET /users/:id - Get a single user
 */
function GetUserResponse() {
  const { id } = useParams<{ id: string }>();
  const user = db.users.get(id);

  return (
    <When condition={user !== undefined} fallback={<NotFoundResponse message="User not found" />}>
      <UserObject user={user!} />
    </When>
  );
}

/**
 * POST /users - Create a new user
 */
function CreateUserResponse() {
  const body = useBody<{ name?: string; email?: string; role?: User["role"] }>();

  // Validation
  if (!body.name || !body.email) {
    return <ErrorResponse message="Name and email are required" code={400} />;
  }

  // Create user
  const id = String(db.nextUserId++);
  const user: User = {
    id,
    name: body.name,
    email: body.email,
    role: body.role || "user",
    createdAt: new Date().toISOString(),
  };
  db.users.set(id, user);

  return (
    <CreatedResponse location={`/api/v1/users/${id}`}>
      <UserObject user={user} />
    </CreatedResponse>
  );
}

/**
 * PUT /users/:id - Update a user
 */
function UpdateUserResponse() {
  const { id } = useParams<{ id: string }>();
  const body = useBody<Partial<User>>();
  const user = db.users.get(id);

  if (!user) {
    return <NotFoundResponse message="User not found" />;
  }

  // Update
  const updated = { ...user, ...body, id: user.id };
  db.users.set(id, updated);

  return <UserObject user={updated} />;
}

/**
 * DELETE /users/:id - Delete a user
 */
function DeleteUserResponse() {
  const { id } = useParams<{ id: string }>();

  if (!db.users.has(id)) {
    return <NotFoundResponse message="User not found" />;
  }

  db.users.delete(id);
  return <Status code={204}><Literal value={null} /></Status>;
}

/**
 * GET /users/:id/role-info - Demonstrate pattern matching
 */
function UserRoleInfoResponse() {
  const { id } = useParams<{ id: string }>();
  const user = db.users.get(id);

  if (!user) {
    return <NotFoundResponse message="User not found" />;
  }

  return (
    <Object>
      <Field name="user">{user.name}</Field>
      <Field name="role">{user.role}</Field>
      <Field name="permissions">
        <Match value={user.role}>
          <Case when="admin">
            <Array>
              <Literal value="read" />
              <Literal value="write" />
              <Literal value="delete" />
              <Literal value="admin" />
            </Array>
          </Case>
          <Case when="user">
            <Array>
              <Literal value="read" />
              <Literal value="write" />
            </Array>
          </Case>
          <Default>
            <Array>
              <Literal value="read" />
            </Array>
          </Default>
        </Match>
      </Field>
    </Object>
  );
}

/**
 * GET /posts - List posts with author info
 */
function ListPostsResponse() {
  const query = useQuery<{ published?: string }>();
  const publishedOnly = query.published === "true";

  let posts = globalThis.Array.from(db.posts.values());
  if (publishedOnly) {
    posts = posts.filter(p => p.published);
  }

  return (
    <Array>
      {posts.map(post => (
        <PostObject key={post.id} post={post} includeAuthor />
      ))}
    </Array>
  );
}

/**
 * GET /posts/:id - Get single post
 */
function GetPostResponse() {
  const { id } = useParams<{ id: string }>();
  const post = db.posts.get(id);

  return (
    <When condition={post !== undefined} fallback={<NotFoundResponse message="Post not found" />}>
      <PostObject post={post!} includeAuthor />
    </When>
  );
}

// ============================================================================
// Type-Safe Response Components (using typed props)
// ============================================================================

/**
 * A response component that receives typed params as props.
 * This is the most type-safe pattern - params are validated at compile time.
 */
function TypedUserResponse({ id }: { id: string }) {
  const user = db.users.get(id);

  if (!user) {
    return <NotFoundResponse message={`User ${id} not found`} />;
  }

  return (
    <Object>
      <Field name="id">{user.id}</Field>
      <Field name="name">{user.name}</Field>
      <Field name="email">{user.email}</Field>
      <Field name="role">{user.role}</Field>
      <Field name="_meta">
        <Object>
          <Field name="fetchedAt">{new Date().toISOString()}</Field>
          <Field name="pattern">typed-render-prop</Field>
        </Object>
      </Field>
    </Object>
  );
}

// ============================================================================
// Middleware (still using traditional handlers for middleware logic)
// ============================================================================

const loggerMiddleware: RouteHandler = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
};

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

/**
 * Zod schemas provide runtime validation AND compile-time types.
 */
const UserIdParamsSchema = z.object({
  id: z.string(),
});

const CreateUserBodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  role: z.enum(["admin", "user", "guest"]).optional().default("user"),
});

const UpdateUserBodySchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "user", "guest"]).optional(),
});

const UserResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["admin", "user", "guest"]),
  createdAt: z.string(),
});

// ============================================================================
// Zod-Validated Response Components
// ============================================================================

/**
 * Response component that receives validated params.
 * Type safety is guaranteed by the Zod schema.
 */
function ValidatedUserResponse({ id }: z.infer<typeof UserIdParamsSchema>) {
  const user = db.users.get(id);

  if (!user) {
    return <NotFoundResponse message={`User ${id} not found`} />;
  }

  return (
    <Object>
      <Field name="id">{user.id}</Field>
      <Field name="name">{user.name}</Field>
      <Field name="email">{user.email}</Field>
      <Field name="role">{user.role}</Field>
      <Field name="createdAt">{user.createdAt}</Field>
      <Field name="_validated">{true}</Field>
    </Object>
  );
}

/**
 * Create user with validated body.
 */
function ValidatedCreateUserResponse({ body }: { body: z.infer<typeof CreateUserBodySchema> }) {
  const id = String(db.nextUserId++);
  const user: User = {
    id,
    name: body.name,
    email: body.email,
    role: body.role,
    createdAt: new Date().toISOString(),
  };
  db.users.set(id, user);

  return (
    <CreatedResponse location={`/api/v2/users/${id}`}>
      <UserObject user={user} />
    </CreatedResponse>
  );
}

// ============================================================================
// Unified Input Schemas (for API v3)
// ============================================================================

/**
 * Unified input schemas merge query and body into a single "input" object.
 * The server and client both just deal with one input - the library handles
 * splitting it into query params vs body based on the schema definition.
 */

// For GET /users - all fields go in query string
const ListUsersInput = input({
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(10),
  search: z.string().optional(),
});

// For POST /users - all fields go in body
const CreateUserInput = input({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "user", "guest"]).optional().default("user"),
});

// For PUT /users/:id - all fields go in body
const UpdateUserInput = input({
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "user", "guest"]).optional(),
});

// For GET /users/:id - with optional query param
const GetUserInput = input({
  include: z.string().optional(), // e.g., "posts" to include user's posts
});

// Output schema for documentation/validation
const UserOutput = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["admin", "user", "guest"]),
  createdAt: z.string(),
});

// ============================================================================
// Main Application
// ============================================================================

/**
 * The main application - notice how routes have component children
 * instead of handler functions!
 */
function App() {
  return (
    <Server>
      <Middleware handler={loggerMiddleware}>
        {/* Root welcome - using component response */}
        <Get path="/">
          <Object>
            <Field name="message">Welcome to JSX Backend v2!</Field>
            <Field name="description">Routes AND responses are components</Field>
            <Field name="endpoints">
              <Object>
                <Field name="users">/api/v1/users</Field>
                <Field name="posts">/api/v1/posts</Field>
              </Object>
            </Field>
          </Object>
        </Get>

        {/* Health check - inline response component */}
        <Get path="/health">
          <Object>
            <Field name="status">healthy</Field>
            <Field name="timestamp">{new Date().toISOString()}</Field>
            <Field name="uptime">{process.uptime()}</Field>
          </Object>
        </Get>

        {/* API routes using response components */}
        <Api path="/api/v1" cors>
          {/* Users CRUD */}
          <Route path="/users">
            <Get>
              <ListUsersResponse />
            </Get>
            <Post>
              <CreateUserResponse />
            </Post>

            <Route path="/:id">
              <Get>
                <GetUserResponse />
              </Get>
              <Put>
                <UpdateUserResponse />
              </Put>
              <Delete>
                <DeleteUserResponse />
              </Delete>

              <Get path="/role-info">
                <UserRoleInfoResponse />
              </Get>
            </Route>
          </Route>

          {/* Posts */}
          <Route path="/posts">
            <Get>
              <ListPostsResponse />
            </Get>
            <Get path="/:id">
              <GetPostResponse />
            </Get>
          </Route>

          {/*
           * TYPED RENDER PROP EXAMPLE
           *
           * This demonstrates the most type-safe pattern:
           * The render prop receives `params` with types inferred from the path!
           *
           * <Get path="/typed/:id"> means params.id is typed as string
           * If you try to access params.foo, TypeScript will error!
           */}
          <Get<"/typed/:id">
            path="/typed/:id"
            render={({ params }) => (
              // params.id is typed as string - try params.nonexistent to see error!
              <TypedUserResponse id={params.id} />
            )}
          />
        </Api>

        {/*
         * API V2 - Using Zod validation and route helpers
         *
         * This demonstrates:
         * 1. Zod schemas for runtime validation
         * 2. Type inference from schemas
         * 3. Route helper functions for less verbose code
         */}
        <Api path="/api/v2" cors>
          {/* Zod-validated GET with params schema */}
          <ZodGet
            path="/users/:id"
            params={UserIdParamsSchema}
            response={UserResponseSchema}
            render={({ params }) => (
              // params.id is validated against UserIdParamsSchema
              <ValidatedUserResponse id={params.id} />
            )}
          />

          {/* Zod-validated POST with body schema */}
          <ZodPost
            path="/users"
            body={CreateUserBodySchema}
            response={UserResponseSchema}
            render={({ body }) => (
              // body is validated and typed from CreateUserBodySchema
              // Invalid requests return 400 with validation errors
              <ValidatedCreateUserResponse body={body} />
            )}
          />

          {/* Zod-validated PUT with params AND body */}
          <ZodPut
            path="/users/:id"
            params={UserIdParamsSchema}
            body={UpdateUserBodySchema}
            render={({ params, body }) => {
              const user = db.users.get(params.id);
              if (!user) {
                return <NotFoundResponse message="User not found" />;
              }
              const updated = { ...user, ...body };
              db.users.set(params.id, updated);
              return <UserObject user={updated} />;
            }}
          />

          {/* Zod-validated DELETE */}
          <ZodDelete
            path="/users/:id"
            params={UserIdParamsSchema}
            render={({ params }) => {
              if (!db.users.has(params.id)) {
                return <NotFoundResponse message="User not found" />;
              }
              db.users.delete(params.id);
              return <Status code={204}><Literal value={null} /></Status>;
            }}
          />

          {/*
           * ROUTE HELPER FUNCTIONS
           *
           * These helpers infer types from the path string automatically.
           * No need for explicit type parameters!
           */}

          {/* Function-style route - types inferred from path */}
          {get("/inferred/:userId/posts/:postId", ({ params }) => (
            // params.userId and params.postId are both typed as string!
            <Object>
              <Field name="userId">{params.userId}</Field>
              <Field name="postId">{params.postId}</Field>
              <Field name="message">Route helper with inferred types</Field>
            </Object>
          ))}

          {/* Route builder chain pattern */}
          {route("/items/:id")
            .get(({ params }) => (
              <Object>
                <Field name="action">get</Field>
                <Field name="id">{params.id}</Field>
              </Object>
            ))
            .delete(({ params }) => (
              <Object>
                <Field name="action">delete</Field>
                <Field name="id">{params.id}</Field>
                <Field name="deleted">{true}</Field>
              </Object>
            ))
            .build()}
        </Api>

        {/*
         * API V3 - Unified Input Pattern
         *
         * This is the cleanest API - query and body are merged into a single "input".
         * - Server: render receives { params, input }
         * - Client: api.getUsers({ page: 1, search: "foo" }) - one object
         * - The library handles splitting into query vs body automatically
         */}
        <Api path="/api/v3" cors>
          {/* GET /users - input becomes query params automatically */}
          <GET
            path="/users"
            input={ListUsersInput}
            output={z.array(UserOutput)}
            render={({ input }) => {
              // input.page, input.limit, input.search are all typed!
              let users = globalThis.Array.from(db.users.values());

              if (input.search) {
                const search = input.search.toLowerCase();
                users = users.filter(
                  (u) =>
                    u.name.toLowerCase().includes(search) ||
                    u.email.toLowerCase().includes(search)
                );
              }

              const start = (input.page - 1) * input.limit;
              const paginated = users.slice(start, start + input.limit);

              return (
                <Object>
                  <Field name="data">
                    <Array>
                      {paginated.map((user) => (
                        <UserObject key={user.id} user={user} />
                      ))}
                    </Array>
                  </Field>
                  <Field name="pagination">
                    <Object>
                      <Field name="page">{input.page}</Field>
                      <Field name="limit">{input.limit}</Field>
                      <Field name="total">{users.length}</Field>
                    </Object>
                  </Field>
                </Object>
              );
            }}
          />

          {/* GET /users/:id - params + optional input */}
          <GET
            path="/users/:id"
            params={z.object({ id: z.string() })}
            input={GetUserInput}
            output={UserOutput}
            render={({ params, input }) => {
              const user = db.users.get(params.id);
              if (!user) {
                return <NotFoundResponse message="User not found" />;
              }

              // If include=posts, fetch user's posts too
              if (input.include === "posts") {
                const posts = globalThis.Array.from(db.posts.values()).filter(
                  (p) => p.userId === user.id
                );
                return (
                  <Object>
                    <Field name="id">{user.id}</Field>
                    <Field name="name">{user.name}</Field>
                    <Field name="email">{user.email}</Field>
                    <Field name="role">{user.role}</Field>
                    <Field name="posts">
                      <Array>
                        {posts.map((post) => (
                          <PostObject key={post.id} post={post} />
                        ))}
                      </Array>
                    </Field>
                  </Object>
                );
              }

              return <UserObject user={user} />;
            }}
          />

          {/* POST /users - input becomes request body */}
          <POST
            path="/users"
            input={CreateUserInput}
            output={UserOutput}
            render={({ input }) => {
              // input is fully validated - name, email required, role has default
              const id = String(db.nextUserId++);
              const user: User = {
                id,
                name: input.name,
                email: input.email,
                role: input.role,
                createdAt: new Date().toISOString(),
              };
              db.users.set(id, user);

              return (
                <CreatedResponse location={`/api/v3/users/${id}`}>
                  <UserObject user={user} />
                </CreatedResponse>
              );
            }}
          />

          {/* PUT /users/:id - params + body input */}
          <PUT
            path="/users/:id"
            params={z.object({ id: z.string() })}
            input={UpdateUserInput}
            output={UserOutput}
            render={({ params, input }) => {
              const user = db.users.get(params.id);
              if (!user) {
                return <NotFoundResponse message="User not found" />;
              }

              const updated: User = {
                ...user,
                ...(input.name && { name: input.name }),
                ...(input.email && { email: input.email }),
                ...(input.role && { role: input.role }),
              };
              db.users.set(params.id, updated);

              return <UserObject user={updated} />;
            }}
          />

          {/* DELETE /users/:id */}
          <DEL
            path="/users/:id"
            params={z.object({ id: z.string() })}
            render={({ params }) => {
              if (!db.users.has(params.id)) {
                return <NotFoundResponse message="User not found" />;
              }
              db.users.delete(params.id);
              return (
                <Status code={204}>
                  <Literal value={null} />
                </Status>
              );
            }}
          />
        </Api>

        {/* 404 fallback - using traditional handler for catch-all */}
        <Get
          path="*"
          handler={(req, res) => {
            res.status(404).json({ error: "Not found", path: req.path });
          }}
        />
      </Middleware>
    </Server>
  );
}

// ============================================================================
// Bootstrap
// ============================================================================

console.log("Starting JSX Backend server (v2 - Component Responses)...\n");

const { app } = render(<App />);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║               JSX Backend Server (Component Responses)                ║
╠══════════════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT.toString().padEnd(31)}║
║                                                                      ║
║  API v1 - Component-based responses (hooks for context):             ║
║    GET  /api/v1/users           - List users (paginated)             ║
║    POST /api/v1/users           - Create user                        ║
║    GET  /api/v1/users/:id       - Get user by ID                     ║
║                                                                      ║
║  API v2 - Zod validation (separate query/body schemas):              ║
║    GET  /api/v2/users/:id       - Zod-validated params               ║
║    POST /api/v2/users           - Zod-validated body                 ║
║    PUT  /api/v2/users/:id       - Params + body validation           ║
║                                                                      ║
║  API v3 - Unified input (query + body merged):                       ║
║    GET  /api/v3/users           - ?page=1&limit=10&search=foo        ║
║    GET  /api/v3/users/:id       - ?include=posts                     ║
║    POST /api/v3/users           - { name, email, role }              ║
║    PUT  /api/v3/users/:id       - { name?, email?, role? }           ║
║    DELETE /api/v3/users/:id     - Delete user                        ║
║                                                                      ║
║  Other: GET / (welcome), GET /health                                 ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  // Demo: Print collected endpoint schemas (for client generation)
  const endpoints = getEndpointSchemas();
  console.log(`\nRegistered ${endpoints.size} endpoints for client generation:`);
  for (const [key, schema] of endpoints) {
    const hasInput = schema.input ? " (has input)" : "";
    console.log(`  - ${key}${hasInput}`);
  }

  // Demo: Generate client code
  console.log("\n--- Generated API Client (preview) ---");
  const clientCode = generateApiClient({ baseUrl: `http://localhost:${PORT}` });
  console.log(clientCode.slice(0, 800) + "\n...(truncated)");
});
