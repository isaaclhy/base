import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateUserProductDetails, getUserByEmail, updateUserKeywords } from "@/lib/db/users";

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
    const { link, productDescription, keywords } = body;

    if (!link && !productDescription && !keywords) {
      return NextResponse.json(
        { error: "At least one field (link, productDescription, or keywords) is required" },
        { status: 400 }
      );
    }

    const email = session.user.email.toLowerCase();
    
    const productDetails: { link?: string; productDescription?: string } = {};
    
    if (link !== undefined) {
      productDetails.link = link;
    }
    
    if (productDescription !== undefined) {
      productDetails.productDescription = productDescription;
    }

    // Update product details (if provided)
    let updatedUser;
    if (Object.keys(productDetails).length > 0) {
      updatedUser = await updateUserProductDetails(email, productDetails);
    } else {
      updatedUser = await getUserByEmail(email);
    }

    // Update keywords separately (if provided)
    if (keywords !== undefined && Array.isArray(keywords)) {
      updatedUser = await updateUserKeywords(email, keywords);
    }

    if (!updatedUser) {
      return NextResponse.json(
        { error: "Failed to update product details" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      productDetails: updatedUser.productDetails,
    });
  } catch (error) {
    console.error("Error updating product details:", error);
    return NextResponse.json(
      { error: "Failed to update product details", details: error instanceof Error ? error.message : "Unknown error" },
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
      productDetails: user.productDetails || { link: undefined, productDescription: undefined },
      keywords: user.keywords || [],
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    return NextResponse.json(
      { error: "Failed to fetch product details", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
