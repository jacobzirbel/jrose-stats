/**
 * Account routes: signup / login / logout. Server-rendered forms (no JS) that
 * set an httpOnly session cookie. No OAuth — password + cookie is all the MVP
 * needs (roadmap §1C).
 */
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { eq } from "drizzle-orm";

import type { AppEnv } from "../auth/middleware";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSession, deleteSession, SESSION_COOKIE } from "../auth/session";
import { db } from "../db/client";
import { users } from "../db/schema";
import { Field, Layout } from "../web/layout.tsx";

export const authRoutes = new Hono<AppEnv>();

const MIN_PASSWORD = 8;

/** Apply the session cookie. `secure` only in production so localhost http works. */
function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 days — mirrors the session TTL
  });
}

function AuthPage({ mode, error }: { mode: "login" | "signup"; error?: string }) {
  const signup = mode === "signup";
  return (
    <Layout title={signup ? "Sign up" : "Log in"} user={null}>
      <h1>{signup ? "Create an account" : "Log in"}</h1>
      {error ? <p style="color:crimson">{error}</p> : null}
      <form method="post" action={signup ? "/signup" : "/login"}>
        <Field label="Username" name="username" />
        {signup ? <Field label="Email" name="email" type="email" /> : null}
        <Field label="Password" name="password" type="password" />
        <p>
          <button type="submit">{signup ? "Sign up" : "Log in"}</button>
        </p>
      </form>
      {signup ? (
        <p>
          Have an account? <a href="/login">Log in</a>
        </p>
      ) : (
        <p>
          New here? <a href="/signup">Sign up</a>
        </p>
      )}
    </Layout>
  );
}

authRoutes.get("/signup", (c) => c.html(<AuthPage mode="signup" />));
authRoutes.get("/login", (c) => c.html(<AuthPage mode="login" />));

authRoutes.post("/signup", async (c) => {
  const body = await c.req.parseBody();
  const username = String(body.username ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!username || !email || !password) {
    return c.html(<AuthPage mode="signup" error="All fields are required." />, 400);
  }
  if (password.length < MIN_PASSWORD) {
    return c.html(
      <AuthPage mode="signup" error={`Password must be at least ${MIN_PASSWORD} characters.`} />,
      400,
    );
  }

  const passwordHash = await hashPassword(password);
  let userId: number;
  try {
    const row = db
      .insert(users)
      .values({ username, email, passwordHash })
      .returning({ id: users.id })
      .get();
    userId = row.id;
  } catch (err) {
    // The username/email UNIQUE indexes are the gate; surface a clean message.
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.html(<AuthPage mode="signup" error="Username or email already taken." />, 409);
    }
    throw err;
  }

  setSessionCookie(c, createSession(db, userId));
  return c.redirect("/");
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  const user = db.select().from(users).where(eq(users.username, username)).get();
  // Verify even on a missing user to avoid leaking which usernames exist by
  // timing, then fail with one generic message either way.
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, PHANTOM_HASH);
  if (!user || !ok) {
    return c.html(<AuthPage mode="login" error="Invalid username or password." />, 401);
  }

  setSessionCookie(c, createSession(db, user.id));
  return c.redirect("/");
});

authRoutes.post("/logout", (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) deleteSession(db, token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.redirect("/");
});

// A fixed argon2id hash of a random string, used to keep login timing constant
// when the username doesn't exist. Never matches a real password.
const PHANTOM_HASH =
  "$argon2id$v=19$m=65536,t=2,p=1$UYbTv8H84IL3PsBPRau/7AyYVkqjUxUlbSKion0PfCo$" +
  "VkFhO9ekNuG2MRhaU1KDlnvhpfFq1tEkbFeLzta1HnU";
