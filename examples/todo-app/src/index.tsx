/**
 * Todo App Example - express-jsx-core
 *
 * Demonstrates:
 * - Request/Response schemas as children of Get/Post/etc (for OpenAPI generation)
 * - Handlers receive flat validated input, return Ok/Err with Fields
 * - Declarative route definition with schema children
 */

import { z } from "zod";
import { render, createContext, useContext, type ExpressJsxNode } from "express-jsx-core";

// =============================================================================
// SCHEMAS
// =============================================================================

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

// Output schemas
const TodoResponse = z.object({
  id: z.number(),
  title: z.string(),
  completed: z.boolean(),
  authorId: z.number(),
  author: UserSchema.pick({ name: true, email: true }),
});

const TodoListResponse = z.object({
  todos: z.array(TodoResponse),
  total: z.number(),
});

const StatusResponse = z.object({
  status: z.string(),
});

// Request schemas (const/type shadowing for cleaner handler signatures)
const GetTodoRequest = z.object({
  id: z.coerce.number(),
});
type GetTodoRequest = z.infer<typeof GetTodoRequest>;

const CreateTodoRequest = z.object({
  title: z.string().min(1),
  completed: z.boolean().optional().default(false),
});
type CreateTodoRequest = z.infer<typeof CreateTodoRequest>;

const DeleteTodoRequest = z.object({
  id: z.coerce.number(),
});
type DeleteTodoRequest = z.infer<typeof DeleteTodoRequest>;

// =============================================================================
// MOCK DATABASE
// =============================================================================

const db = {
  users: [
    { id: 1, name: "Alice", email: "alice@example.com" },
    { id: 2, name: "Bob", email: "bob@example.com" },
  ],
  todos: [
    { id: 1, title: "Learn express-jsx-core", completed: false, authorId: 1 },
    { id: 2, title: "Build something cool", completed: false, authorId: 1 },
    { id: 3, title: "Write docs", completed: true, authorId: 2 },
  ],
};

// =============================================================================
// CONTEXT
// =============================================================================

type User = z.infer<typeof UserSchema>;
const UserContext = createContext<User | null>(null);

function useUser(): User {
  const user = useContext(UserContext);
  if (!user) {
    throw new Error("useUser must be used within Auth middleware");
  }
  return user;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

function Logger({
  req,
  next,
}: {
  req: { method: string; path: string };
  next: () => ExpressJsxNode;
}) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  return next();
}

function Auth({
  req,
  next,
}: {
  req: { headers: Record<string, string> };
  next: () => ExpressJsxNode;
}) {
  const token = req.headers["authorization"];

  if (!token) {
    return (
      <Err status={401}>
        <Field name="error">{"Unauthorized"}</Field>
      </Err>
    );
  }

  const user = db.users.find((u) => u.id === 1)!;
  return <UserContext.Provider value={user}>{next()}</UserContext.Provider>;
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

function HealthCheck() {
  return (
    <Ok>
      <Field name="status">{"ok"}</Field>
    </Ok>
  );
}

function ListTodos() {
  const todosWithAuthors = db.todos.map((todo) => ({
    ...todo,
    author: db.users.find((u) => u.id === todo.authorId)!,
  }));

  return (
    <Ok>
      <Field name="todos">{todosWithAuthors}</Field>
      <Field name="total">{db.todos.length}</Field>
    </Ok>
  );
}

function GetTodo({ id }: GetTodoRequest) {
  const todo = db.todos.find((t) => t.id === id);

  if (!todo) {
    return (
      <Err status={404}>
        <Field name="error">{"Todo not found"}</Field>
      </Err>
    );
  }

  const author = db.users.find((u) => u.id === todo.authorId)!;

  return (
    <Ok>
      <Field name="id">{todo.id}</Field>
      <Field name="title">{todo.title}</Field>
      <Field name="completed">{todo.completed}</Field>
      <Field name="authorId">{todo.authorId}</Field>
      <Field name="author">{{ name: author.name, email: author.email }}</Field>
    </Ok>
  );
}

function CreateTodo({ title, completed }: CreateTodoRequest) {
  const user = useUser();

  const newTodo = {
    id: db.todos.length + 1,
    title,
    completed,
    authorId: user.id,
  };

  db.todos.push(newTodo);

  return (
    <Ok status={201}>
      <Field name="id">{newTodo.id}</Field>
      <Field name="title">{newTodo.title}</Field>
      <Field name="completed">{newTodo.completed}</Field>
      <Field name="authorId">{newTodo.authorId}</Field>
      <Field name="author">{{ name: user.name, email: user.email }}</Field>
    </Ok>
  );
}

function DeleteTodo({ id }: DeleteTodoRequest) {
  const index = db.todos.findIndex((t) => t.id === id);

  if (index === -1) {
    return (
      <Err status={404}>
        <Field name="error">{"Todo not found"}</Field>
      </Err>
    );
  }

  db.todos.splice(index, 1);
  return <Ok status={204} />;
}

// =============================================================================
// APP - Request/Response/Handler as children for declarative route definition
// =============================================================================

const app = (
  <App port={3000}>
    <Route path="/api">
      <Middleware>{Logger}</Middleware>
      <Route path="/health">
        <Get>
          <Response>{StatusResponse}</Response>
          <Handler>{HealthCheck}</Handler>
        </Get>
      </Route>
      <Route path="/todos">
        <Middleware>{Auth}</Middleware>
        <Route path="/">
          <Get>
            <Response>{TodoListResponse}</Response>
            <Handler>{ListTodos}</Handler>
          </Get>
          <Post>
            <Request>{CreateTodoRequest}</Request>
            <Response>{TodoResponse}</Response>
            <Handler>{CreateTodo}</Handler>
          </Post>
        </Route>
        <Route path="/:id">
          <Get>
            <Request>{GetTodoRequest}</Request>
            <Response>{TodoResponse}</Response>
            <Handler>{GetTodo}</Handler>
          </Get>
          <Delete>
            <Request>{DeleteTodoRequest}</Request>
            <Handler>{DeleteTodo}</Handler>
          </Delete>
        </Route>
      </Route>
    </Route>
  </App>
);

render(app);
