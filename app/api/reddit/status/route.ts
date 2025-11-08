import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserByEmail } from "@/lib/db/users";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await getUserByEmail(session.user.email);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      connected: !!(user.redditAccessToken && user.redditRefreshToken),
      hasAccessToken: !!user.redditAccessToken,
      hasRefreshToken: !!user.redditRefreshToken,
    });
  } catch (error) {
    console.error("Error checking Reddit status:", error);
    return NextResponse.json(
      { error: "Failed to check Reddit connection status" },
      { status: 500 }
    );
  }
}

