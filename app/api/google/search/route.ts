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
  resultsPerQuery: number = 7
): Promise<customsearch_v1.Schema$Search[]> {
  // Google Custom Search API allows max 10 results per request
  // We fetch top results per query (default 7) for better coverage
  const num = Math.min(resultsPerQuery, 10); // Cap at 10 (Google's max per request)
  
  const response = await customsearch.cse.list({
    auth: process.env.GCS_KEY,
    cx: "c691f007075074afc",
    q: query,
    num: num,
    start: 1, // Always start from the first result (top results)
  });

  const results = response.data;
  if (!results) {
    throw new Error("No data returned from Google Custom Search");
  }

  return [results]; // Return as array for consistency with previous implementation
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
    const { searchQuery, resultsPerQuery } = await request.json();

    if (!searchQuery) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    // Fetch only the top few results per query (default 7 for better coverage)
    const resultsPerSearch = resultsPerQuery || 7;
    const googleDataArray = await fetchGoogleCustomSearch(searchQuery, resultsPerSearch);
    console.log("GOOGLE DATA ", googleDataArray);

    // Combine all results
    const allItems = googleDataArray.flatMap((googleData) => googleData.items || []);

    const results = allItems
      .filter((data) => isRedditPostUrl(data.link ?? ""))
      .slice(0, resultsPerSearch) // Limit to resultsPerQuery
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

