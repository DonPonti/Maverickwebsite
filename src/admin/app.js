(() => {
    'use strict'

    const API = '/.netlify/functions/maverick'
    const SESSION = 'maverick-admin-session'
    let token = sessionStorage.getItem(SESSION) || ''
    let posts = []
    let editing = null

    const $ = (selector, root = document) => root.querySelector(selector)
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c])

    async function api(url = '', options = {}) {
        const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
        const response = await fetch(API + url, { ...options, headers })
        const text = await response.text()
        let data = {}
        try { data = text ? JSON.parse(text) : {} } catch { data = {} }
        if (!response.ok) throw new Error(data.error || 'Admin request failed')
        return data
    }

    function slugify(value) {
        return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    }

    function quote(value) {
        return JSON.stringify(String(value ?? ''))
    }

    function parsePost(content) {
        const match = String(content).match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
        if (!match) return { meta: {}, body: String(content) }

        const meta = {}
        match[1].split('\n').forEach((line) => {
            const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
            if (!m) return
            let value = m[2].trim()
            if (value === 'true') value = true
            else if (value === 'false') value = false
            else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                try { value = JSON.parse(value) } catch { value = value.slice(1, -1) }
            }
            meta[m[1]] = value
        })

        return { meta, body: match[2] }
    }

    function buildPost(meta, body) {
        const lines = ['---']
        Object.entries(meta).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
                if (key === 'demo') lines.push(`${key}: ""`)
                return
            }
            if (typeof value === 'boolean') lines.push(`${key}: ${value}`)
            else if (typeof value === 'number') lines.push(`${key}: ${value}`)
            else lines.push(`${key}: ${quote(value)}`)
        })
        lines.push('---', '', String(body || '').replace(/^\n+/, ''))
        return lines.join('\n')
    }

    function login() {
        $('#app').hidden = true
        $('#login').innerHTML = `
            <h1>MaverickTimes Admin</h1>
            <p class="hint">Private publishing studio. Saves are committed directly to the GitHub repository and then Netlify rebuilds the site.</p>
            <form id="loginForm" class="form">
                <label>Admin password
                    <input id="password" type="password" autocomplete="current-password" placeholder="Enter your admin password" required>
                </label>
                <p class="hint">Your GitHub token is never sent to this browser.</p>
                <button class="btn">Open Content Studio</button>
                <div id="loginMsg"></div>
            </form>`

        $('#loginForm').onsubmit = async (event) => {
            event.preventDefault()
            token = $('#password').value.trim()
            try {
                await loadPosts()
                sessionStorage.setItem(SESSION, token)
                start()
            } catch (error) {
                token = ''
                sessionStorage.removeItem(SESSION)
                $('#loginMsg').innerHTML = `<div class="notice error">${esc(error.message)}</div>`
            }
        }
    }

    async function loadPosts() {
        posts = await api('?op=posts')
        return posts
    }

    function start() {
        $('#login').hidden = true
        $('#app').hidden = false
        dashboard()
    }

    function shell(title, body, sub = '') {
        $('#app').innerHTML = `
            <div class="shell">
                <aside>
                    <button class="nav active" data-view="dashboard">Dashboard</button>
                    <button class="nav" data-view="posts">Blog Posts</button>
                    <button class="nav" data-view="new">+ New Post</button>
                    <button class="nav sep" data-view="settings">Settings</button>
                </aside>
                <main class="main">
                    <div class="head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div></div>
                    <div id="content">${body}</div>
                </main>
            </div>`

        document.querySelectorAll('.nav').forEach((button) => {
            button.onclick = () => {
                if (button.dataset.view === 'dashboard') dashboard()
                else if (button.dataset.view === 'posts') postList()
                else if (button.dataset.view === 'new') editPost()
                else settings()
            }
        })
    }

    function dashboard() {
        const recent = posts.slice().sort((a, b) => b.name.localeCompare(a.name)).slice(0, 6)
        shell('Dashboard', `
            <div class="statgrid">
                <div class="stat" data-view="posts"><strong>${posts.length}</strong><span>Published / draft posts</span></div>
                <div class="stat"><strong>${posts.filter(p => p.name.includes('-index.md')).length}</strong><span>Markdown entries</span></div>
                <div class="stat"><strong>GitHub</strong><span>Source of truth</span></div>
            </div>
            <div class="panel">
                <div class="sectionTitle"><h2>Recent posts</h2><button class="btn" id="newPost">+ New Post</button></div>
                <div class="list">${recent.map(postRow).join('') || '<div class="empty">No posts found.</div>'}</div>
            </div>`)

        $('#newPost').onclick = () => editPost()
        document.querySelectorAll('.stat[data-view]').forEach((x) => x.onclick = () => postList())
        bindRows()
    }

    function postRow(file) {
        const title = file.title || file.name.replace(/-index\.md$/, '')
        return `<div class="row">
            <div><h3>${esc(title)}</h3><small>${esc(file.name)} <span class="badge">Markdown</span></small></div>
            <div class="actions"><button class="btn secondary" data-edit="${esc(file.path)}">Edit</button></div>
        </div>`
    }

    function postList() {
        const rows = posts.slice().sort((a, b) => a.path.localeCompare(b.path)).map(postRow).join('')
        shell('Blog Posts', `
            <div class="toolbar"><input id="search" placeholder="Search posts..."><button class="btn" id="newPost">+ New Post</button></div>
            <div id="postList" class="list">${rows || '<div class="empty">No posts found.</div>'}</div>`)

        $('#newPost').onclick = () => editPost()
        $('#search').oninput = () => {
            const q = $('#search').value.toLowerCase()
            $('#postList').innerHTML = posts.filter((p) => (p.name + ' ' + (p.title || '')).toLowerCase().includes(q)).map(postRow).join('') || '<div class="empty">No matches.</div>'
            bindRows()
        }
        bindRows()
    }

    function bindRows() {
        document.querySelectorAll('[data-edit]').forEach((button) => {
            button.onclick = () => editPost(button.dataset.edit)
        })
    }

    async function editPost(path = '') {
        editing = null
        let parsed = { meta: {}, body: '' }
        let file = null

        if (path) {
            file = posts.find((p) => p.path === path)
            try {
                const response = await api(`?op=file&path=${encodeURIComponent(path)}`)
                const binary = atob(response.content.replace(/\n/g, ''))
                const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
                parsed = parsePost(new TextDecoder().decode(bytes))
                editing = { path, sha: response.sha }
            } catch (error) {
                alert(error.message)
                return
            }
        }

        const m = parsed.meta
        shell(path ? 'Edit Post' : 'New Post', `
            <form id="postForm" class="form">
                <div class="editorbar"><span class="hint">${path ? esc(path) : 'A new post will be created in src/posts/'}</span>${path && m.slug ? `<a href="/blog/${encodeURIComponent(m.slug)}/" target="_blank" rel="noopener">Preview ↗</a>` : ''}</div>
                <div class="two">
                    <label>Title<input id="title" required value="${esc(m.title || '')}"></label>
                    <label>Slug<input id="slug" required value="${esc(m.slug || '')}"></label>
                </div>
                <div class="two">
                    <label>Tags<input id="tags" value="${esc(m.tags || 'blog')}" placeholder="blog"></label>
                    <label>Demo URL<input id="demo" value="${esc(m.demo || '')}"></label>
                </div>
                <label>Description<textarea id="description">${esc(m.description || '')}</textarea></label>
                <div class="two">
                    <label>Image filename<input id="image" value="${esc(m.image || '')}" placeholder="cover.jpg"></label>
                    <label>Featured image filename<input id="featuredImage" value="${esc(m.featuredImage || '')}"></label>
                </div>
                <div class="two">
                    <label class="check"><input id="featured" type="checkbox" ${m.featured ? 'checked' : ''}> Featured post</label>
                    <label class="check"><input id="draft" type="checkbox" ${m.draft ? 'checked' : ''}> Draft</label>
                </div>
                <label>Markdown content<textarea id="body" spellcheck="false">${esc(parsed.body)}</textarea></label>
                <div class="actions">
                    <button class="btn">${path ? 'Save Changes' : 'Publish Post'}</button>
                    <button type="button" class="btn secondary" id="cancel">Cancel</button>
                    ${path ? '<button type="button" class="btn danger" id="delete">Delete Post</button>' : ''}
                </div>
                <div id="formMsg"></div>
            </form>`)

        $('#title').oninput = () => {
            if (!path || !$('#slug').dataset.edited) $('#slug').value = slugify($('#title').value)
        }
        $('#slug').oninput = () => { $('#slug').dataset.edited = '1' }
        $('#cancel').onclick = () => postList()

        $('#postForm').onsubmit = async (event) => {
            event.preventDefault()
            const title = $('#title').value.trim()
            const slug = slugify($('#slug').value)
            if (!title || !slug) return

            const meta = { ...m }
            meta.title = title
            meta.slug = slug
            meta.tags = $('#tags').value.trim() || 'blog'
            meta.description = $('#description').value.trim()
            meta.demo = $('#demo').value.trim()
            meta.featured = $('#featured').checked
            meta.draft = $('#draft').checked
            if ($('#image').value.trim()) meta.image = $('#image').value.trim()
            else delete meta.image
            if ($('#featuredImage').value.trim()) meta.featuredImage = $('#featuredImage').value.trim()
            else delete meta.featuredImage

            const content = buildPost(meta, $('#body').value)
            let target = path
            if (!target) {
                const date = new Date().toISOString().slice(0, 10)
                target = `src/posts/${slug}/${date}-index.md`
            }

            try {
                const body = {
                    op: 'save',
                    path: target,
                    content: b64(content),
                    sha: editing?.sha,
                    message: `${path ? 'Update' : 'Publish'} post: ${title}`
                }
                await api('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
                $('#formMsg').innerHTML = '<div class="notice success">Saved to GitHub. Netlify will rebuild the site automatically.</div>'
                await loadPosts()
                setTimeout(() => postList(), 700)
            } catch (error) {
                $('#formMsg').innerHTML = `<div class="notice error">${esc(error.message)}</div>`
            }
        }

        if (path) {
            $('#delete').onclick = async () => {
                if (!confirm('Delete this post from GitHub? This cannot be undone from this admin.')) return
                try {
                    await api('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
                        op: 'delete', path, sha: editing.sha, message: `Delete post: ${m.title || file?.name || path}`
                    }) })
                    await loadPosts()
                    postList()
                } catch (error) {
                    $('#formMsg').innerHTML = `<div class="notice error">${esc(error.message)}</div>`
                }
            }
        }
    }

    function b64(value) {
        const bytes = new TextEncoder().encode(value)
        let binary = ''
        bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
        return btoa(binary)
    }

    function settings() {
        shell('Settings', `
            <div class="panel">
                <h2>Netlify / GitHub setup</h2>
                <p class="hint">This admin uses two Netlify environment variables. They are never placed in the repository or browser JavaScript.</p>
                <p><strong>MAVERICK_ADMIN_PASSWORD</strong><br><span class="muted">The password you enter on this page.</span></p>
                <p><strong>MAVERICK_GITHUB_TOKEN</strong><br><span class="muted">A GitHub token with permission to read and write this repository.</span></p>
                <p class="hint">After changing either variable in Netlify, trigger a fresh deploy so the function receives the new value.</p>
            </div>
            <div class="panel"><button class="btn secondary" id="logout">Log out</button></div>`)
        $('#logout').onclick = () => { sessionStorage.removeItem(SESSION); token = ''; login() }
    }

    if (token) loadPosts().then(start).catch(login)
    else login()
})()
