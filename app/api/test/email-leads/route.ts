import { NextRequest, NextResponse } from "next/server";
import { generateNewLeadsEmailTemplate } from "@/lib/brevo/email";
import { sendBrevoEmail } from "@/lib/brevo/email";

export async function POST(request: NextRequest) {
  try {
    const { email, userName, leadCount } = await request.json();

    // Default test values
    const testEmail = email || "leehuanyoei2025@gmail.com";
    const testUserName = userName || "Test User";
    const testLeadCount = leadCount || 42;

    // Generate email template
    const { htmlContent, textContent } = generateNewLeadsEmailTemplate({
      userName: testUserName,
      leadCount: testLeadCount,
      dashboardUrl: process.env.NEXTAUTH_URL 
        ? `${process.env.NEXTAUTH_URL}/playground`
        : "https://signalscouter.com/playground",
    });

    // Send email
    await sendBrevoEmail({
      to: testEmail,
      subject: `New Leads Found - ${testLeadCount} Leads Ready for You!`,
      htmlContent,
      textContent,
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${testEmail}`,
      details: {
        email: testEmail,
        userName: testUserName,
        leadCount: testLeadCount,
      },
    });
  } catch (error) {
    console.error("Error sending test email:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send test email",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Default test values for GET request
    const testEmail = "leehuanyoei2025@gmail.com";
    const testUserName = "Test User";
    const testLeadCount = 42;

    // Generate email template
    const { htmlContent, textContent } = generateNewLeadsEmailTemplate({
      userName: testUserName,
      leadCount: testLeadCount,
      dashboardUrl: process.env.NEXTAUTH_URL 
        ? `${process.env.NEXTAUTH_URL}/playground`
        : "https://signalscouter.com/playground",
    });

    // Send email
    await sendBrevoEmail({
      to: testEmail,
      subject: `New Leads Found - ${testLeadCount} Leads Ready for You!`,
      htmlContent,
      textContent,
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${testEmail}`,
      details: {
        email: testEmail,
        userName: testUserName,
        leadCount: testLeadCount,
      },
    });
  } catch (error) {
    console.error("Error sending test email:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send test email",
      },
      { status: 500 }
    );
  }
}
