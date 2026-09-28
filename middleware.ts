import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  // Skip auth for the login page, API routes, Next internals and static files (anything with an extension)
  matcher: ["/((?!login|api|_next|static|public|.*\\..*).*)"],
};
