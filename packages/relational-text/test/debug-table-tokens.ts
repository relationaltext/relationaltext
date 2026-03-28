import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true }).enable(['strikethrough', 'table'])

const input = `| Mark | expandStart | expandEnd |
|------|------------|-----------|
| bold | true | true |
| italic | true | true |
`

const tokens = md.parse(input, {})
for (const t of tokens) {
  console.log(`${t.type} (hidden=${t.hidden}) [tag=${t.tag}] content=${JSON.stringify(t.content)}`)
  if (t.children) {
    for (const c of t.children) {
      console.log(`  child: ${c.type} content=${JSON.stringify(c.content)}`)
    }
  }
}
