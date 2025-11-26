import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDatabase } from "@/lib/mongodb";

export interface Feedback {
  _id?: string;
  userId: string;
  message: string;
  createdAt: Date;
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
    const { message } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required and cannot be empty" },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const feedbackCollection = db.collection<Feedback>("feedback");

    const feedback: Feedback = {
      userId: session.user.email.toLowerCase(),
      message: message.trim(),
      createdAt: new Date(),
    };

    await feedbackCollection.insertOne(feedback);

    return NextResponse.json({
      success: true,
      message: "Feedback submitted successfully",
    });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    return NextResponse.json(
      { error: "Failed to submit feedback. Please try again." },
      { status: 500 }
    );
  }
}

