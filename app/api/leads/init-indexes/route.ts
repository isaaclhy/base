import { NextRequest, NextResponse } from "next/server";
import { initializeLeadsIndexes } from "@/lib/db/leads";

/**
 * POST /api/leads/init-indexes
 * Initialize database indexes for the leads collection
 * This should be called once on app startup or during migration
 */
export async function POST(request: NextRequest) {
  try {
    await initializeLeadsIndexes();
    return NextResponse.json({
      success: true,
      message: "Indexes initialized successfully",
    });
  } catch (error) {
    console.error("Error initializing indexes:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to initialize indexes" },
      { status: 500 }
    );
  }
}
