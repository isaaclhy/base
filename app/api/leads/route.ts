import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createLead,
  createLeads,
  getLeadsByUserId,
  getLeadsByUserIdGrouped,
  updateLeadFilterSignal,
  updateLeadsFilterSignals,
  updateLead,
  deleteLeadsByUserId,
  type CreateLeadData,
  type FilterSignal,
} from "@/lib/db/leads";

/**
 * GET /api/leads
 * Get leads for the current user
 * Query params:
 *   - keyword?: string - Filter by keyword
 *   - filterSignal?: "YES" | "MAYBE" | "NO" - Filter by signal
 *   - grouped?: "true" - Return grouped by keyword (for backward compatibility)
 *   - limit?: number - Limit results
 *   - skip?: number - Skip results (for pagination)
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

    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get("keyword") || undefined;
    const filterSignal = searchParams.get("filterSignal") as FilterSignal | null;
    const grouped = searchParams.get("grouped") === "true";
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;
    const skip = searchParams.get("skip") ? parseInt(searchParams.get("skip")!) : undefined;

    if (grouped) {
      // Return in the old format: Record<string, Lead[]>
      const leads = await getLeadsByUserIdGrouped(session.user.email, {
        filterSignal: filterSignal || undefined,
      });

      // Transform to match the frontend format (without _id, createdAt, updatedAt)
      const transformed: Record<string, Array<{
        title?: string | null;
        link?: string | null;
        snippet?: string | null;
        selftext?: string | null;
        postData?: any;
        query?: string;
        uniqueKey?: string;
        filterSignal?: "YES" | "MAYBE" | "NO" | null;
      }>> = {};

      for (const [kw, leadArray] of Object.entries(leads)) {
        transformed[kw] = leadArray.map(lead => ({
          title: lead.title,
          link: lead.link,
          snippet: lead.snippet,
          selftext: lead.selftext,
          postData: lead.postData,
          query: lead.query || lead.keyword,
          uniqueKey: `${lead.link || lead.title || 'unknown'}-${lead.keyword}`,
          filterSignal: lead.filterSignal || null,
        }));
      }

      return NextResponse.json({ leads: transformed });
    } else {
      const leads = await getLeadsByUserId(session.user.email, {
        keyword,
        filterSignal: filterSignal || undefined,
        limit,
        skip,
      });

      return NextResponse.json({ leads });
    }
  } catch (error) {
    console.error("Error fetching leads:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/leads
 * Create or update leads (batch)
 * Body: {
 *   leads: CreateLeadData[],
 *   keyword?: string (optional, for backward compatibility)
 * }
 */
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
    const { leads, keyword } = body;

    if (!leads || !Array.isArray(leads)) {
      return NextResponse.json(
        { error: "leads array is required" },
        { status: 400 }
      );
    }

    // Transform leads data to include userId and ensure keyword is set
    const leadsData: CreateLeadData[] = leads.map((lead: any) => ({
      userId: session.user.email!,
      keyword: keyword || lead.keyword || lead.query || "unknown",
      query: lead.query || lead.keyword || keyword,
      title: lead.title || null,
      link: lead.link || null,
      snippet: lead.snippet || null,
      selftext: lead.selftext || null,
      postData: lead.postData || null,
      filterSignal: lead.filterSignal || null,
      syncedAt: lead.syncedAt ? new Date(lead.syncedAt) : new Date(),
    }));

    console.log(`[API Leads] Creating ${leadsData.length} leads for user: ${session.user.email}`);
    const result = await createLeads(leadsData);
    console.log(`[API Leads] Successfully created leads: inserted=${result.inserted}, updated=${result.updated}, total=${leadsData.length}`);

    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      updated: result.updated,
      total: leadsData.length,
    });
  } catch (error) {
    console.error("[API Leads] Error creating leads:", error);
    console.error("[API Leads] Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Failed to create leads",
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/leads
 * Update leads (batch update with post data)
 * Body: {
 *   leads: Array<{ link: string; title?: string; snippet?: string; selftext?: string; postData?: RedditPost }>
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
    const { leads } = body;

    if (!leads || !Array.isArray(leads)) {
      return NextResponse.json(
        { error: "leads array is required" },
        { status: 400 }
      );
    }

    // Get all existing leads to map links to lead IDs
    const existingLeads = await getLeadsByUserId(session.user.email);
    const linkToLeadId = new Map<string, string>();
    existingLeads.forEach(lead => {
      if (lead.link) {
        const normalized = lead.link.toLowerCase().trim();
        linkToLeadId.set(normalized, lead._id!.toString());
      }
    });

    // Update each lead
    const { updateLead } = await import("@/lib/db/leads");
    let updated = 0;
    for (const leadUpdate of leads) {
      if (!leadUpdate.link) continue;
      const normalized = leadUpdate.link.toLowerCase().trim();
      const leadId = linkToLeadId.get(normalized);
      if (leadId) {
        await updateLead(session.user.email, leadId, {
          title: leadUpdate.title,
          snippet: leadUpdate.snippet,
          selftext: leadUpdate.selftext,
          postData: leadUpdate.postData,
        });
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      updated,
    });
  } catch (error) {
    console.error("Error updating leads:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update leads" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/leads
 * Delete leads for the current user
 * Query params:
 *   - keyword?: string - Delete leads for a specific keyword only
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get("keyword") || undefined;

    const result = await deleteLeadsByUserId(session.user.email, keyword);

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
    });
  } catch (error) {
    console.error("Error deleting leads:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete leads" },
      { status: 500 }
    );
  }
}
