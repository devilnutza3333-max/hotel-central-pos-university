import { NextResponse } from "next/server";
import { deleteCurrentSession, SESSION_COOKIE } from "../../../local-auth";

export async function GET(request: Request) {
  await deleteCurrentSession();
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
