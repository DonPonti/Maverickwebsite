const OWNER = 'DonPonti'
const REPO = 'Maverickwebsite'
const BRANCH = 'main'
const API = `https://api.github.com/repos/${OWNER}/${REPO}`
const POSTS = 'src/posts/'

const json = (status, body) => ({
    statusCode: status,
    headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store'
    },
    body: JSON.stringify(body)
})

function allowed(path) {
    return path.startsWith(POSTS) && path.endsWith('.md') && !path.includes('..')
}

async function github(path, options = {}) {
    const response = await fetch(API + path, {
        ...options,
        headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${process.env.MAVERICK_GITHUB_TOKEN}`,
            'x-github-api-version': '2026-03-10',
            ...(options.headers || {})
        }
    })

    const text = await response.text()
    let data = {}
    try {
        data = text ? JSON.parse(text) : {}
    } catch {
        data = {}
    }

    if (!response.ok) {
        throw new Error(data.message || 'GitHub request failed')
    }

    return data
}

function decodeBase64(value) {
    return Buffer.from(String(value || '').replace(/\\n/g, ''), 'base64').toString('utf8')
}

function extractTitle(content, fallback) {
    const match = String(content || '').match(/^---\\s*\\n[\\s\\S]*?\\n---\\s*\\n?/)
    const frontmatter = match ? match[0] : ''
    const title = frontmatter.match(/^title:\\s*["']?(.*?)["']?\\s*$/m)
    return title?.[1] || fallback
}

export const handler = async (event) => {
    const suppliedPassword = String(event.headers?.authorization || '').replace(/^Bearer\\s+/i, '')
    const configuredPassword = String(process.env.MAVERICK_ADMIN_PASSWORD || '')

    // Keep the diagnostic separate from invalid credentials so a Netlify
    // environment-variable configuration problem is immediately identifiable.
    if (!configuredPassword) {
        return json(500, { error: 'MAVERICK_ADMIN_PASSWORD is not configured in this Netlify deploy context' })
    }

    if (suppliedPassword !== configuredPassword) {
        return json(401, { error: 'Invalid admin password' })
    }

    if (!process.env.MAVERICK_GITHUB_TOKEN) {
        return json(500, { error: 'MAVERICK_GITHUB_TOKEN is not configured in this Netlify deploy context' })
    }

    try {
        const query = event.queryStringParameters || {}

        if (event.httpMethod === 'GET' && query.op === 'posts') {
            const tree = await github(`/git/trees/${BRANCH}?recursive=1`)
            const files = Array.isArray(tree.tree)
                ? tree.tree
                    .filter((item) => item.type === 'blob' && item.path.startsWith(POSTS) && item.path.endsWith('.md'))
                    .map((item) => ({
                        name: item.path.split('/').pop(),
                        path: item.path,
                        sha: item.sha,
                        title: item.path.split('/').slice(-2, -1)[0]
                    }))
                : []

            return json(200, files)
        }

        if (event.httpMethod === 'GET' && query.op === 'file') {
            const path = decodeURIComponent(query.path || '')
            if (!allowed(path)) return json(400, { error: 'Path not allowed' })

            return json(200, await github(`/contents/${path}?ref=${BRANCH}`))
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}')
            const path = String(body.path || '')

            if (body.op === 'save') {
                if (!allowed(path)) return json(400, { error: 'Path not allowed' })

                const payload = {
                    message: String(body.message || 'Update MaverickTimes post'),
                    content: String(body.content || ''),
                    branch: BRANCH
                }

                if (body.sha) payload.sha = body.sha

                const response = await github(`/contents/${path}`, {
                    method: 'PUT',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload)
                })

                return json(200, {
                    sha: response.content?.sha,
                    commit: response.commit?.sha,
                    path
                })
            }

            if (body.op === 'delete') {
                if (!allowed(path) || !body.sha) {
                    return json(400, { error: 'Invalid delete request' })
                }

                const response = await github(`/contents/${path}`, {
                    method: 'DELETE',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        message: String(body.message || 'Delete MaverickTimes post'),
                        sha: body.sha,
                        branch: BRANCH
                    })
                })

                return json(200, { commit: response.commit?.sha })
            }

            return json(400, { error: 'Unknown operation' })
        }

        return json(400, { error: 'Unknown request' })
    } catch (error) {
        return json(500, { error: error.message || 'MaverickTimes admin error' })
    }
}
