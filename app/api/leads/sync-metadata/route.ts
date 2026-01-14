import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getLatestSyncTime,
  getLeadCountByUserId,
  getLeadCountsByKeyword,
} from "@/lib/db/leads";

/**
 * GET /api/leads/sync-metadata
 * Get sync metadata for the current user
 * Returns: {
 *   lastSyncTime: Date | null,
 *   totalLeads: number,
 *   leadsByKeyword: Record<string, number>
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const [lastSyncTime, totalLeads, leadsByKeyword] = await Promise.all([
      getLatestSyncTime(session.user.email),
      getLeadCountByUserId(session.user.email),
      getLeadCountsByKeyword(session.user.email),
    ]);

    return NextResponse.json({
      lastSyncTime: lastSyncTime ? lastSyncTime.toISOString() : null,
      totalLeads,
      leadsByKeyword,
    });
  } catch (error) {
    console.error("Error fetching sync metadata:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch sync metadata" },
      { status: 500 }
    );
  }
}
