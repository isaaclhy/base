import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateUserOnboardingStatus, getUserByEmail } from "@/lib/db/users";

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
      onboardingCompleted: user.onboardingCompleted ?? false,
    });
  } catch (error) {
    console.error("Error fetching onboarding status:", error);
    return NextResponse.json(
      { error: "Failed to fetch onboarding status", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

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
    const { onboardingCompleted } = body;

    if (typeof onboardingCompleted !== "boolean") {
      return NextResponse.json(
        { error: "onboardingCompleted must be a boolean" },
        { status: 400 }
      );
    }

    const email = session.user.email.toLowerCase();
    const updatedUser = await updateUserOnboardingStatus(email, onboardingCompleted);

    if (!updatedUser) {
      return NextResponse.json(
        { error: "Failed to update onboarding status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      onboardingCompleted: updatedUser.onboardingCompleted ?? false,
    });
  } catch (error) {
    console.error("Error updating onboarding status:", error);
    return NextResponse.json(
      { error: "Failed to update onboarding status", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

