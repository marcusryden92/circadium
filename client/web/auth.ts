// Every server action and route handler reads the signed-in user through
// `auth()`; the session itself is the Java access cookie (lib/session).
export { getSession as auth } from "@/lib/session/session";
