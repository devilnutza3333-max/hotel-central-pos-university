import { NextResponse } from "next/server";
import { deleteCurrentSession, SESSION_COOKIE } from "../../../local-auth";

async function performLogout(request: Request) {
  await deleteCurrentSession();
  const response=NextResponse.redirect(new URL("/login",request.url),{status:303});
  response.cookies.set(SESSION_COOKIE,"",{
    httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0,
  });
  return response;
}
export async function POST(request: Request) {
  const origin=request.headers.get("origin");
  if(origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({error:"ไม่อนุญาตให้ขอออกจากระบบจากเว็บไซต์อื่น"},{status:403});
  }
  return performLogout(request);
}
// Backwards compatibility for existing sign-out links from older app shells.
export async function GET(request: Request) {
  return performLogout(request);
}
