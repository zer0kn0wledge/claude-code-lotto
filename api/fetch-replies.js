export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const bearer = process.env.TWITTER_BEARER_TOKEN;
  if (!bearer) {
    return res.status(500).json({ error: 'TWITTER_BEARER_TOKEN not configured in Vercel environment' });
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'url parameter required' });
  }

  // Extract tweet ID from various URL formats
  const match = url.match(/status\/(\d+)/);
  const tweetId = match ? match[1] : /^\d+$/.test(url) ? url : null;
  if (!tweetId) {
    return res.status(400).json({ error: 'Could not extract tweet ID from URL' });
  }

  try {
    // Step 1: Get the tweet to find conversation_id and author
    const tweetRes = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=conversation_id,author_id&expansions=author_id&user.fields=username`,
      { headers: { Authorization: `Bearer ${bearer}` } }
    );

    if (!tweetRes.ok) {
      const err = await tweetRes.json().catch(() => ({}));
      return res.status(tweetRes.status).json({
        error: 'Twitter API error fetching tweet',
        status: tweetRes.status,
        details: err
      });
    }

    const tweetData = await tweetRes.json();
    if (!tweetData.data) {
      return res.status(404).json({ error: 'Tweet not found' });
    }

    const conversationId = tweetData.data.conversation_id || tweetId;
    const hostUsername = tweetData.includes?.users?.[0]?.username?.toLowerCase() || '';

    // Step 2: Paginate through all replies in the conversation
    const usernames = new Map(); // lowercase -> original casing
    let nextToken = null;
    let totalReplies = 0;
    let pages = 0;

    do {
      const params = new URLSearchParams({
        query: `conversation_id:${conversationId}`,
        'tweet.fields': 'author_id',
        expansions: 'author_id',
        'user.fields': 'username',
        max_results: '100'
      });
      if (nextToken) params.set('next_token', nextToken);

      const searchRes = await fetch(
        `https://api.twitter.com/2/tweets/search/recent?${params}`,
        { headers: { Authorization: `Bearer ${bearer}` } }
      );

      if (!searchRes.ok) {
        const err = await searchRes.json().catch(() => ({}));
        // If we already have some results, return what we have
        if (usernames.size > 0) {
          break;
        }
        return res.status(searchRes.status).json({
          error: 'Twitter search API error',
          status: searchRes.status,
          details: err
        });
      }

      const searchData = await searchRes.json();
      totalReplies += searchData.meta?.result_count || 0;
      pages++;

      if (searchData.includes?.users) {
        for (const user of searchData.includes.users) {
          const lower = user.username.toLowerCase();
          // Exclude the tweet author (host)
          if (lower !== hostUsername && !usernames.has(lower)) {
            usernames.set(lower, user.username);
          }
        }
      }

      nextToken = searchData.meta?.next_token || null;

      // Safety: max 20 pages (2000 replies)
      if (pages >= 20) break;
    } while (nextToken);

    const sorted = [...usernames.values()].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );

    return res.status(200).json({
      tweet_id: tweetId,
      conversation_id: conversationId,
      host: hostUsername,
      total_replies: totalReplies,
      pages_fetched: pages,
      entrant_count: sorted.length,
      entrants: sorted
    });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error', message: e.message });
  }
}
