export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured' });

  const { results } = req.body;
  if (!results) return res.status(400).json({ error: 'results required' });

  const owner = 'zer0kn0wledge';
  const repo = 'claude-code-lotto';
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  // LOCK CHECK: if bonus-results.json is already non-pending, reject
  try {
    const checkRes = await fetch(`${api}/contents/data/bonus-results.json`, { headers });
    if (checkRes.ok) {
      const current = await checkRes.json();
      const content = JSON.parse(Buffer.from(current.content, 'base64').toString());
      if (content.status !== 'pending') {
        return res.status(409).json({ error: 'Bonus draw already executed — results are permanently locked' });
      }
    }
  } catch (e) {}

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

    // Create blob
    const blobRes = await fetch(`${api}/git/blobs`, {
      method: 'POST', headers,
      body: JSON.stringify({ content: JSON.stringify(results, null, 2), encoding: 'utf-8' })
    });
    const blobData = await blobRes.json();

    // Create new tree
    const newTreeRes = await fetch(`${api}/git/trees`, {
      method: 'POST', headers,
      body: JSON.stringify({
        base_tree: treeSha,
        tree: [
          { path: 'data/bonus-results.json', mode: '100644', type: 'blob', sha: blobData.sha }
        ]
      })
    });
    const newTreeData = await newTreeRes.json();

    // Create commit
    const winner = results.winners[0];
    const newCommitRes = await fetch(`${api}/git/commits`, {
      method: 'POST', headers,
      body: JSON.stringify({
        message: `bonus draw executed — @${winner} wins (courtesy of @kasentuner)\n\nEligible: ${results.eligible_count} (3 original winners excluded)\nWinner: @${winner}\nSeed hash: ${results.seed_hash_sha256}`,
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
      message: 'Bonus results committed and permanently locked'
    });
  } catch (e) {
    return res.status(500).json({ error: 'Commit failed', message: e.message });
  }
}
