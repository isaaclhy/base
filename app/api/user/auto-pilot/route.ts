import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateUserAutoPilotStatus, getUserByEmail } from "@/lib/db/users";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { autoPilotEnabled } = body;

    if (typeof autoPilotEnabled !== "boolean") {
      return NextResponse.json(
        { error: "autoPilotEnabled (boolean) is required" },
        { status: 400 }
      );
    }

    const email = session.user.email.toLowerCase();
    const updatedUser = await updateUserAutoPilotStatus(email, autoPilotEnabled);

    if (!updatedUser) {
      return NextResponse.json(
        { error: "Failed to update auto-pilot status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      autoPilotEnabled: updatedUser.autoPilotEnabled,
    });
  } catch (error) {
    console.error("Error updating auto-pilot status:", error);
    return NextResponse.json(
      { error: "Failed to update auto-pilot status", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const email = session.user.email.toLowerCase();
    const user = await getUserByEmail(email);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      autoPilotEnabled: user.autoPilotEnabled || false,
    });
  } catch (error) {
    console.error("Error fetching auto-pilot status:", error);
    return NextResponse.json(
      { error: "Failed to fetch auto-pilot status", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

