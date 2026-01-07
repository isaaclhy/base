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
  resultsPerQuery: number = 7,
  noDateRestrict: boolean = false
): Promise<customsearch_v1.Schema$Search[]> {
  // Google Custom Search API allows max 10 results per request
  // To get more than 10 results, we need to make multiple requests
  const maxPerRequest = 10;
  const totalResults = Math.min(resultsPerQuery, 20); // Cap at 20
  const requestsNeeded = Math.ceil(totalResults / maxPerRequest);
  
  const allResults: customsearch_v1.Schema$Search[] = [];
  
  for (let i = 0; i < requestsNeeded; i++) {
    const startIndex = i * maxPerRequest + 1;
    const numResults = Math.min(maxPerRequest, totalResults - (i * maxPerRequest));
    
    const requestParams: any = {
      auth: process.env.GCS_KEY,
      cx: "84be52ff9627b480b",
      q: query,
      num: numResults,
      start: startIndex,
    };
    
    // Only add dateRestrict if not disabled
    if (!noDateRestrict) {
      requestParams.dateRestrict = "d4"; // Limit results to past 4 days
    }
        
    const response = await customsearch.cse.list(requestParams);

    const results = response.data;
    if (!results) {
      throw new Error("No data returned from Google Custom Search");
    }
    
    allResults.push(results);
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
    const { searchQuery, resultsPerQuery, noDateRestrict } = await request.json();

    if (!searchQuery) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    // Fetch only the top few results per query (default 7 for better coverage)
    const resultsPerSearch = resultsPerQuery || 7;
    const googleDataArray = await fetchGoogleCustomSearch(searchQuery, resultsPerSearch, noDateRestrict || false);
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

