export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const { results, entrants } = req.body;
  if (!results || !entrants) return res.status(400).json({ error: 'results and entrants required' });

  const owner = 'zer0kn0wledge';
  const repo = 'claude-code-lotto';
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  // LOCK CHECK: if results.json is already non-pending, reject immediately
  try {
    const checkRes = await fetch(`${api}/contents/data/results.json`, { headers });
    if (checkRes.ok) {
      const current = await checkRes.json();
      const content = JSON.parse(Buffer.from(current.content, 'base64').toString());
      if (content.status !== 'pending') {
        return res.status(409).json({ error: 'Draw already executed — results are permanently locked' });
      }
    }
  } catch (e) {
    // If we can't check, proceed cautiously
  }

  try {
    // Get current HEAD
    const refRes = await fetch(`${api}/git/ref/heads/main`, { headers });
    if (!refRes.ok) return res.status(500).json({ error: 'Could not get HEAD ref' });
    const refData = await refRes.json();
    const headSha = refData.object.sha;

    // Get current commit tree
    const commitRes = await fetch(`${api}/git/commits/${headSha}`, { headers });
    const commitData = await commitRes.json();
    const treeSha = commitData.tree.sha;

    // Create blobs for both files
    const [entrantsBlob, resultsBlob] = await Promise.all([
      fetch(`${api}/git/blobs`, {
        method: 'POST', headers,
        body: JSON.stringify({ content: JSON.stringify(entrants, null, 2), encoding: 'utf-8' })
      }).then(r => r.json()),
      fetch(`${api}/git/blobs`, {
        method: 'POST', headers,
        body: JSON.stringify({ content: JSON.stringify(results, null, 2), encoding: 'utf-8' })
      }).then(r => r.json())
    ]);

    // Create new tree with both files
    const newTreeRes = await fetch(`${api}/git/trees`, {
      method: 'POST', headers,
      body: JSON.stringify({
        base_tree: treeSha,
        tree: [
          { path: 'data/entrants.json', mode: '100644', type: 'blob', sha: entrantsBlob.sha },
          { path: 'data/results.json', mode: '100644', type: 'blob', sha: resultsBlob.sha }
        ]
      })
    });
    const newTreeData = await newTreeRes.json();

    // Create commit
    const winnerList = results.winners.map(w => '@' + w).join(', ');
    const newCommitRes = await fetch(`${api}/git/commits`, {
      method: 'POST', headers,
      body: JSON.stringify({
        message: `draw executed — winners selected\n\nEntrants: ${entrants.entrant_count}\nWinners: ${winnerList}\nSeed hash: ${results.seed_hash_sha256}`,
        tree: newTreeData.sha,
        parents: [headSha]
      })
    });
    const newCommitData = await newCommitRes.json();

    // Update branch ref
    const updateRefRes = await fetch(`${api}/git/refs/heads/main`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ sha: newCommitData.sha })
    });

    if (!updateRefRes.ok) {
      return res.status(500).json({ error: 'Failed to update branch ref' });
    }

    return res.status(200).json({
      success: true,
      commit: newCommitData.sha,
      message: 'Results committed and permanently locked'
    });
  } catch (e) {
    return res.status(500).json({ error: 'Commit failed', message: e.message });
  }
}
