import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  updateLeadFilterSignal,
  updateLeadsFilterSignals,
  type FilterSignal,
} from "@/lib/db/leads";

/**
 * PATCH /api/leads/filter-signal
 * Update filter signal for a lead or batch of leads
 * Body: {
 *   leadId?: string, // Single update
 *   filterSignal: "YES" | "MAYBE" | "NO" | null,
 *   // OR for batch:
 *   updates?: Array<{ leadId: string; filterSignal: "YES" | "MAYBE" | "NO" | null }>
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { leadId, filterSignal, updates } = body;

    // Batch update
    if (updates && Array.isArray(updates)) {
      const result = await updateLeadsFilterSignals(session.user.email, updates);
      return NextResponse.json({
        success: true,
        updated: result.updated,
      });
    }

    // Single update
    if (!leadId) {
      return NextResponse.json(
        { error: "leadId is required" },
        { status: 400 }
      );
    }

    if (filterSignal !== null && filterSignal !== "YES" && filterSignal !== "MAYBE" && filterSignal !== "NO") {
      return NextResponse.json(
        { error: "filterSignal must be 'YES', 'MAYBE', 'NO', or null" },
        { status: 400 }
      );
    }

    const updated = await updateLeadFilterSignal(
      session.user.email,
      leadId,
      filterSignal as FilterSignal | null
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Lead not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      lead: updated,
    });
  } catch (error) {
    console.error("Error updating filter signal:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update filter signal" },
      { status: 500 }
    );
  }
}
