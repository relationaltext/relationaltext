import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('fountain', 'html')
})

// ─── fromFountain — title page ────────────────────────────────────────────────

describe('fromFountain — title page', () => {
  it('parses title page key-value pairs', async () => {
    const input = 'Title: My Script\nAuthor: Jane Doe\n\nINT. OFFICE - DAY\nSome action.'
    const doc = await from('fountain', input)
    const hir = doc.toHIR()
    const titleBlocks = hir.filter((n) => n.type === 'block' && n.name === 'title-page')
    expect(titleBlocks.length).toBeGreaterThanOrEqual(2)
    if (titleBlocks[0]?.type === 'block') {
      expect(titleBlocks[0].attrs['key']).toBe('Title')
      expect(titleBlocks[0].attrs['value']).toBe('My Script')
    }
    if (titleBlocks[1]?.type === 'block') {
      expect(titleBlocks[1].attrs['key']).toBe('Author')
      expect(titleBlocks[1].attrs['value']).toBe('Jane Doe')
    }
  })

  it('title page stops at first blank line', async () => {
    const input = 'Title: My Script\n\nINT. OFFICE - DAY'
    const doc = await from('fountain', input)
    const hir = doc.toHIR()
    const titleBlocks = hir.filter((n) => n.type === 'block' && n.name === 'title-page')
    expect(titleBlocks.length).toBe(1)
    // Scene heading should still be present
    const sceneHeading = hir.find((n) => n.type === 'block' && n.name === 'scene-heading')
    expect(sceneHeading).toBeDefined()
  })
})

// ─── fromFountain — block types ───────────────────────────────────────────────

describe('fromFountain — scene heading', () => {
  it('parses INT. scene heading', async () => {
    const doc = await from('fountain', 'INT. COFFEE SHOP - DAY')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'scene-heading')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const text = block.children.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.content : '')).join('')
      expect(text).toContain('COFFEE SHOP')
    }
  })

  it('parses EXT. scene heading', async () => {
    const doc = await from('fountain', 'EXT. PARK - NIGHT')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'scene-heading')
    expect(block).toBeDefined()
  })

  it('parses forced scene heading with leading dot', async () => {
    const doc = await from('fountain', '.My Custom Scene')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'scene-heading')
    expect(block).toBeDefined()
  })
})

describe('fromFountain — action block', () => {
  it('parses plain text as action block', async () => {
    const doc = await from('fountain', 'The hero walks into the room.')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'action')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const text = block.children.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.content : '')).join('')
      expect(text).toContain('hero walks')
    }
  })

  it('parses forced action with ! prefix', async () => {
    const doc = await from('fountain', '!HERO storms out.')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'action')
    expect(block).toBeDefined()
  })
})

describe('fromFountain — character', () => {
  it('parses ALL CAPS line preceded by blank as character', async () => {
    const input = 'INT. ROOM - DAY\n\nHERO\nHello there.'
    const doc = await from('fountain', input)
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'character')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const text = block.children.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.content : '')).join('')
      expect(text).toBe('HERO')
    }
  })

  it('parses character with extension like (O.S.)', async () => {
    const input = '\nHERO (O.S.)\nVoice over text.'
    const doc = await from('fountain', input)
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'character')
    expect(block).toBeDefined()
  })
})

describe('fromFountain — dialogue after character', () => {
  it('parses line after character as dialogue', async () => {
    const input = '\nHERO\nThis is what I say.'
    const doc = await from('fountain', input)
    const hir = doc.toHIR()
    const dialogue = hir.find((n) => n.type === 'block' && n.name === 'dialogue')
    expect(dialogue).toBeDefined()
    if (dialogue?.type === 'block') {
      const text = dialogue.children.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.content : '')).join('')
      expect(text).toContain('This is what I say')
    }
  })

  it('dialogue follows character correctly (no action between them)', async () => {
    const input = '\nVILLAIN\nI will destroy you!'
    const doc = await from('fountain', input)
    const hir = doc.toHIR()
    const charBlock = hir.find((n) => n.type === 'block' && n.name === 'character')
    const dialogueBlock = hir.find((n) => n.type === 'block' && n.name === 'dialogue')
    expect(charBlock).toBeDefined()
    expect(dialogueBlock).toBeDefined()
    // Should NOT be an action block
    const actionBlock = hir.find((n) => n.type === 'block' && n.name === 'action')
    expect(actionBlock).toBeUndefined()
  })
})

describe('fromFountain — parenthetical', () => {
  it('parses (text) on its own line in dialogue context as parenthetical', async () => {
    const input = '\nHERO\n(whispering)\nCome closer.'
    const doc = await from('fountain', input)
    const hir = doc.toHIR()
    const paren = hir.find((n) => n.type === 'block' && n.name === 'parenthetical')
    expect(paren).toBeDefined()
    if (paren?.type === 'block') {
      const text = paren.children.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.content : '')).join('')
      expect(text).toContain('whispering')
    }
  })
})

describe('fromFountain — transition', () => {
  it('parses ALL CAPS ending with TO: as transition', async () => {
    const doc = await from('fountain', 'CUT TO:')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'transition')
    expect(block).toBeDefined()
  })

  it('parses forced transition with > prefix', async () => {
    const doc = await from('fountain', '> SMASH CUT TO:')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'transition')
    expect(block).toBeDefined()
  })
})

describe('fromFountain — lyric', () => {
  it('parses ~ line as lyric block', async () => {
    const doc = await from('fountain', '~La la la')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'lyric')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const text = block.children.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.content : '')).join('')
      expect(text).toContain('La la la')
    }
  })
})

describe('fromFountain — page break', () => {
  it('parses === as page-break block', async () => {
    const doc = await from('fountain', '===')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'page-break')
    expect(block).toBeDefined()
  })
})

describe('fromFountain — section heading', () => {
  it('parses # Section as section level 1', async () => {
    const doc = await from('fountain', '# Act One')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'section')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      expect(block.attrs['level']).toBe(1)
      const text = block.children.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.content : '')).join('')
      expect(text).toContain('Act One')
    }
  })

  it('parses ## SubSection as section level 2', async () => {
    const doc = await from('fountain', '## Scene 1')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'section')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      expect(block.attrs['level']).toBe(2)
    }
  })
})

describe('fromFountain — synopsis', () => {
  it('parses = synopsis as synopsis block', async () => {
    const doc = await from('fountain', '= The hero arrives at the mansion.')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'synopsis')
    expect(block).toBeDefined()
  })
})

// ─── fromFountain — inline marks ──────────────────────────────────────────────

describe('fromFountain — inline marks', () => {
  it('parses **text** as bold mark', async () => {
    const doc = await from('fountain', '**hero** walks in.')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.fountain.facet#bold'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('hero')
      }
    }
  })

  it('parses *text* as italic mark', async () => {
    const doc = await from('fountain', '*slowly* walks in.')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.fountain.facet#italic'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('slowly')
      }
    }
  })

  it('parses _text_ as underline mark', async () => {
    const doc = await from('fountain', '_important_ action.')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.fountain.facet#underline'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('important')
      }
    }
  })

  it('parses [[note]] as note mark', async () => {
    const doc = await from('fountain', 'Action [[editorial note]] continues.')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.fountain.facet#note'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('editorial note')
      }
    }
  })

  it('parses ***text*** as both bold and italic', async () => {
    const doc = await from('fountain', '***emphasis*** here.')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const boldSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.fountain.facet#bold'),
      )
      const italicSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.fountain.facet#italic'),
      )
      expect(boldSeg).toBeDefined()
      expect(italicSeg).toBeDefined()
    }
  })
})

// ─── Round-trips ──────────────────────────────────────────────────────────────

describe('toFountain — round-trips', () => {
  it('round-trips scene heading', async () => {
    const input = 'INT. COFFEE SHOP - DAY'
    const result = await to('fountain', await from('fountain', input))
    expect(result).toContain('COFFEE SHOP')
  })

  it('round-trips character and dialogue', async () => {
    const input = '\nHERO\nHello, world!'
    const result = await to('fountain', await from('fountain', input))
    expect(result).toContain('HERO')
    expect(result).toContain('Hello, world!')
  })

  it('round-trips lyric', async () => {
    const result = await to('fountain', await from('fountain', '~La la la'))
    expect(result).toContain('~La la la')
  })

  it('round-trips page break', async () => {
    const result = await to('fountain', await from('fountain', '==='))
    expect(result).toContain('===')
  })

  it('round-trips section heading', async () => {
    const result = await to('fountain', await from('fountain', '# Act One'))
    expect(result).toContain('# Act One')
  })

  it('round-trips bold mark', async () => {
    const result = await to('fountain', await from('fountain', '**bold text** here.'))
    expect(result).toContain('**bold text**')
  })

  it('round-trips italic mark', async () => {
    const result = await to('fountain', await from('fountain', '*italic text* here.'))
    expect(result).toContain('*italic text*')
  })

  it('round-trips note mark', async () => {
    const result = await to('fountain', await from('fountain', 'Action [[my note]] continues.'))
    expect(result).toContain('[[my note]]')
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(fountain, ...))', () => {
  it('scene heading → contains heading text in HTML', async () => {
    const html = await to('html', await from('fountain', 'INT. COFFEE SHOP - DAY'))
    expect(html).toContain('COFFEE SHOP')
  })

  it('bold → <strong>', async () => {
    const html = await to('html', await from('fountain', '**bold text** action.'))
    expect(html).toContain('<strong>bold text</strong>')
  })

  it('italic → <em>', async () => {
    const html = await to('html', await from('fountain', '*italic text* action.'))
    expect(html).toContain('<em>italic text</em>')
  })

  it('action → <p>', async () => {
    const html = await to('html', await from('fountain', 'The hero enters the room.'))
    expect(html).toContain('<p>')
    expect(html).toContain('The hero enters the room.')
  })
})
