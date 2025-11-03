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
): Promise<customsearch_v1.Schema$Search> {
  const response = await customsearch.cse.list({
    auth: process.env.GCS_KEY,
    cx: "c691f007075074afc",
    q: query,
    num: Math.min(10, Math.ceil(Math.sqrt(postCount))),
    dateRestrict: "d7",
  });

  const results: customsearch_v1.Schema$Search = response.data;
  if (!results) {
    throw new Error("No data returned from Google Custom Search");
  }

  return results;
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

    // Fetch Google search results
    const googleData = await fetchGoogleCustomSearch(searchQuery, postCount);
    console.log("GOOGLE DATA ", googleData);

    const results = (googleData.items || [])
      .filter((data) => isRedditPostUrl(data.link ?? ""))
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

