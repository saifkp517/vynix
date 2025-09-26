import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    token?: string;
  }

  interface JWT {
    accessToken?: string;
  }
}

