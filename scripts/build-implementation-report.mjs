import { readFile, readdir, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const escapeHtml = text => String(text).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])

// 実装記録で使うMarkdown（見出し・表・リスト・コード・リンク・太字）を変換する。
// 外部ライブラリやブラウザでのMarkdown変換を必要とせず、本文をHTMLに埋め込む。
function inline(text) {
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g
  let result = ''
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    result += escapeHtml(text.slice(cursor, match.index))
    if (match[1] !== undefined) result += `<code>${escapeHtml(match[1])}</code>`
    else if (match[2] !== undefined) {
      const href = match[3]
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href)) throw new Error(`未対応のリンク: ${href}`)
      result += `<a href="${escapeHtml(href)}">${inline(match[2])}</a>`
    } else result += `<strong>${inline(match[4])}</strong>`
    cursor = match.index + match[0].length
  }
  return result + escapeHtml(text.slice(cursor))
}

function renderMarkdown(markdown, phase) {
  const lines = markdown.trim().split(/\r?\n/).slice(1) // 文書タイトルはarticleのh2に表示
  const output = []
  const headings = []
  const isList = line => /^(?:- |\d+\. )/.test(line)
  const isBlock = line => !line.trim() || /^(?:#{1,6} |```|\||<!-- report-html:start -->)/.test(line) || isList(line)
  const cells = line => line.trim().slice(1, -1).split('|').map(cell => cell.trim())
  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    if (!line.trim()) { index++; continue }
    // リポジトリ内の記録に置いた配置図・回答フォームを、その位置に表示する。
    if (line === '<!-- report-html:start -->') {
      const html = []
      index++
      while (index < lines.length && lines[index] !== '<!-- report-html:end -->') html.push(lines[index++])
      if (index === lines.length) throw new Error(`Phase ${phase}: HTMLブロックが閉じていません。`)
      output.push(html.join('\n'))
      index++
    } else if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const code = []
      index++
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++])
      if (index === lines.length) throw new Error(`Phase ${phase}: コードブロックが閉じていません。`)
      output.push(`<pre aria-label="${escapeHtml(language || 'コード')}"><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      index++
    } else if (/^#{1,6} /.test(line)) {
      const [, marks, title] = line.match(/^(#+) (.+)$/)
      const id = `phase-${phase}-section-${headings.length}`
      headings.push({ id, title, level: marks.length })
      const level = Math.min(marks.length + 1, 6)
      output.push(`<h${level} id="${id}">${inline(title)}</h${level}>`)
      index++
    } else if (line.startsWith('|')) {
      const header = cells(line)
      const separator = cells(lines[index + 1] ?? '')
      if (header.length !== separator.length || !separator.every(cell => /^:?-+:?$/.test(cell))) throw new Error(`Phase ${phase}: 表の区切り行が不正です。`)
      index += 2
      const rows = []
      while (index < lines.length && lines[index].startsWith('|')) {
        const row = cells(lines[index++])
        if (row.length !== header.length) throw new Error(`Phase ${phase}: 表の列数が一致しません。`)
        rows.push(`<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`)
      }
      output.push(`<div class="table-scroll" tabindex="0" role="region" aria-label="${escapeHtml(headings.at(-1)?.title ?? '表')}"><table><thead><tr>${header.map(cell => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.join('\n')}</tbody></table></div>`)
    } else if (isList(line)) {
      const ordered = /^\d+\./.test(line)
      const tag = ordered ? 'ol' : 'ul'
      const start = ordered ? Number(line.match(/^\d+/)[0]) : 1
      const items = []
      while (index < lines.length && (ordered ? /^\d+\. / : /^- /).test(lines[index])) {
        const content = lines[index++].replace(/^(?:- |\d+\. )/, '')
        const checkbox = content.match(/^\[([x ])\] (.*)$/i)
        items.push(checkbox ? `<li class="check-item"><span class="check" aria-label="${checkbox[1] === ' ' ? '未完了' : '完了'}">${checkbox[1] === ' ' ? '○' : '✓'}</span><span>${inline(checkbox[2])}</span></li>` : `<li>${inline(content)}</li>`)
      }
      output.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.join('\n')}</${tag}>`)
    } else {
      const paragraph = [line]
      index++
      while (index < lines.length && !isBlock(lines[index])) paragraph.push(lines[index++])
      output.push(`<p>${inline(paragraph.join(' '))}</p>`)
    }
  }
  return { html: output.join('\n'), headings }
}

const descriptions = {
  0: { title: '描画基盤', summary: 'VueとThree.jsをつなぎ、四角形を描画。入力・リサイズ・GPUの後始末を確認。' },
  1: { title: '規則から生成', summary: 'Linear / Grid配置、Modifier、個別Overrides。生成数を変えても設定を保持。' },
  2: { title: '時刻から評価', summary: 'Keyframe、Easing、Stagger。Group / Child / Individualを合成し、任意の時点を再現。' },
  3: { title: '編集・再生・保存', summary: '4領域のEditorでTransitionを制作。画面値の編集、再生、JSON入出力、自動保存と復元に対応。' },
  5: { title: '直接操作と取り消し', summary: '図形の選択・移動・回転・拡縮、キーのドラッグ、Undo/Redo。一つの操作を一つの履歴にまとめる。' },
  4: { title: 'スライド間の演出', summary: '保存したTransitionをVueスライドへ割り当て。指定時刻で一度だけ切り替え、描画失敗時も発表を継続。' },
}
const filenames = (await readdir(new URL('docs/phases/', root)))
  .filter(name => /^phase-\d+-result\.md$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
if (!filenames.length) throw new Error('実装記録がありません。')
const reports = await Promise.all(filenames.map(async filename => {
  const markdown = await readFile(new URL(`docs/phases/${filename}`, root), 'utf8')
  const phase = Number(filename.match(/\d+/)[0])
  const title = markdown.split('\n')[0].replace(/^# /, '')
  const date = markdown.match(/確認日:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? '記載なし'
  const tests = markdown.match(/\*\*(\d+)件成功/)?.[1] ?? '—'
  const build = /`npm run build`:\s*\*\*成功/.test(markdown) ? '成功' : '原本参照'
  return { phase, filename, title, date, tests, build, ...descriptions[phase], ...renderMarkdown(markdown, phase) }
}))
const latest = reports.at(-1)
// 指示書だけがあるPhaseは、本文を転載せず未着手の枠として表示する。
// 実装記録が追加されたPhaseは、自動的に通常のレポートへ移る。
const plannedNames = (await readdir(new URL('docs/phases/', root)))
  .filter(name => /^phase-\d+\.md$/.test(name))
  .filter(name => !reports.some(report => report.phase === Number(name.match(/\d+/)[0])))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
const planned = await Promise.all(plannedNames.map(async filename => {
  const markdown = await readFile(new URL(`docs/phases/${filename}`, root), 'utf8')
  return { phase: Number(filename.match(/\d+/)[0]), title: markdown.split('\n')[0].replace(/^# Phase \d+\s*[—–-]\s*/, '') }
}))
const cards = reports.map(report => `<a class="phase-card" href="#phase-${report.phase}">
  <span class="phase-label">PHASE ${report.phase.toString().padStart(2, '0')}</span><h3>${escapeHtml(report.title)}</h3>
  <p>${escapeHtml(report.summary ?? '実装内容・検証結果・引き継ぎ事項を記録。')}</p>
  <div class="card-meta"><span><b>${report.tests}</b> テスト成功</span><span>詳細へ ↗</span></div></a>`).join('\n')
const articles = reports.map(report => `<article id="phase-${report.phase}" class="phase-report" aria-labelledby="phase-${report.phase}-title">
  <header class="report-header"><div><p class="phase-label">PHASE ${report.phase.toString().padStart(2, '0')} / IMPLEMENTATION RECORD</p>
  <h2 id="phase-${report.phase}-title">${escapeHtml(report.title)}<span>実装・検証記録</span></h2></div>
  <a class="source-link" href="phases/${report.filename}">Markdown原本 ↗</a></header>
  <div class="report-meta"><span>確認日 <time datetime="${report.date}">${report.date}</time></span><span>テスト <b>${report.tests}件成功</b></span><span>ビルド <b>${report.build}</b></span></div>
  <details class="section-index"><summary>このPhaseの目次</summary><ul>${report.headings.filter(heading => heading.level === 2).map(heading => `<li><a href="#${heading.id}">${inline(heading.title)}</a></li>`).join('')}</ul></details>
  <div class="record-body">${report.html}</div><a class="back-top" href="#overview">↑ 全体概要へ戻る</a></article>`).join('\n')
const replacements = {
  NAV: reports.map(report => `<a href="#phase-${report.phase}"><span>0${report.phase}</span> ${escapeHtml(report.title)}</a>`).join('\n'),
  PLANNED_NAV: planned.map(report => `<a href="#phase-${report.phase}"><span>${String(report.phase).padStart(2, '0')}</span> Phase ${report.phase} · 未着手</a>`).join('\n'),
  PLANNED: planned.length ? `<section id="upcoming" class="upcoming" aria-labelledby="upcoming-title"><div class="section-heading"><h2 id="upcoming-title">今後のPhase</h2><span>本文は実装後に追記</span></div>${planned.map(report => `<div id="phase-${report.phase}" class="planned-phase"><div><p class="phase-label">PHASE ${String(report.phase).padStart(2, '0')}</p><h3>${escapeHtml(report.title)}</h3></div><span class="planned-status">未着手</span></div>`).join('\n')}</section>` : '',
  CARDS: cards,
  RECORDS: articles,
  VALIDATION: reports.map(report => `<tr><th scope="row">Phase ${report.phase}</th><td>${report.tests}件成功</td><td><span class="success">${report.build}</span></td><td>${report.date}</td></tr>`).join('\n'),
  RANGE: `${reports[0].phase}–${latest.phase}`,
  LATEST_PHASE: latest.phase,
  LATEST_TESTS: latest.tests,
  LATEST_DATE: latest.date,
}
const template = await readFile(new URL('scripts/implementation-report.template.html', root), 'utf8')
const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
  if (!Object.hasOwn(replacements, key)) throw new Error(`テンプレート変数がありません: ${key}`)
  return replacements[key]
})
await writeFile(new URL('docs/implementation-report.html', root), html)
console.log(`docs/implementation-report.html を生成しました（${reports.length} Phase、${Buffer.byteLength(html)} bytes）。`)
