import { NextRequest, NextResponse } from "next/server";
import { google, customsearch_v1 } from "googleapis";

const customsearch = google.customsearch("v1");

function isRedditPostUrl(url: string) {
  return (
    /reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+(\/|$)/i.test(url) &&
    !/\/comment\//i.test(url)
  );
}

async function fetchGoogleCustomSearch(
  query: string,
  postCount: number
): Promise<customsearch_v1.Schema$Search[]> {
  // Google Custom Search API allows max 10 results per request
  // We need to make multiple requests if postCount > 10
  const requestsNeeded = Math.ceil(postCount / 10);
  const allResults: customsearch_v1.Schema$Search[] = [];

  for (let i = 0; i < requestsNeeded; i++) {
    const startIndex = i * 10 + 1; // Google API uses 1-based indexing
    const num = Math.min(10, postCount - (i * 10)); // Number of results for this request
    
    const response = await customsearch.cse.list({
      auth: process.env.GCS_KEY,
      cx: "c691f007075074afc",
      q: query,
      num: num,
      start: startIndex,
      dateRestrict: "d7",
    });

    const results = response.data;
    if (!results) {
      throw new Error("No data returned from Google Custom Search");
    }

    allResults.push(results);
    
    // If we got fewer results than requested, we've reached the end
    if (!results.items || results.items.length < num) {
      break;
    }
  }

  return allResults;
}

type RedditSearchResult = {
  title?: string | null;
  link?: string | null;
  snippet?: string | null;
};

type PostResponse = { results: RedditSearchResult[] } | { error: string };

export async function POST(
  request: NextRequest
): Promise<NextResponse<PostResponse>> {
  try {
    const { searchQuery, postCount } = await request.json();

    if (!searchQuery) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    // Fetch Google search results (may return multiple pages)
    const googleDataArray = await fetchGoogleCustomSearch(searchQuery, postCount || 10);
    console.log("GOOGLE DATA ", googleDataArray);

    // Combine all results from multiple pages
    const allItems = googleDataArray.flatMap((googleData) => googleData.items || []);

    const results = allItems
      .filter((data) => isRedditPostUrl(data.link ?? ""))
      .slice(0, postCount || 10) // Limit to requested postCount
      .map((item) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
      }));

    return NextResponse.json({ results });
  } catch (err: any) {
    console.log(err);
    return NextResponse.json({ error: `${err}` }, { status: 500 });
  }
}

