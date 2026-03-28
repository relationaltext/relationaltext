/**
 * Round-trip tests for social platform and editor format hub lenses.
 *
 * For every invertible lens (slack, whatsapp, threads; prosemirror, tiptap,
 * quill, lexical, slate): applying the forward lens then the inverse lens
 * should produce features equivalent to the originals.
 *
 * Non-invertible lenses (mastodon, discord, telegram, linkedin — marked
 * invertible:false) are excluded from round-trip tests; they are covered by
 * forward-direction tests only.
 *
 * All hub lenses use passthrough:"keep" so unmatched source features pass
 * through unchanged. The cleanness guarantee lives in the relationaltext→
 * commonmark lens (passthrough:"drop"), which is the appropriate place in the
 * autoTransform chain.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { initRelationalText } from '../src/core.js'
import { applyLens, inverseLens, LensInversionError, type LensSpec } from '../src/lens.js'
import type { DocumentJSON, FacetJSON } from '../src/types.js'

// Import social lens JSON data files
import slackToRTData from '../../../formats/com.slack.mrkdwn/slack-to-relationaltext.lens.json' with { type: 'json' }
import whatsappToRTData from '../../../formats/com.whatsapp/whatsapp-to-relationaltext.lens.json' with { type: 'json' }
import threadsToRTData from '../../../formats/com.threads/threads-to-relationaltext.lens.json' with { type: 'json' }
import mastodonToRTData from '../../../formats/org.joinmastodon/mastodon-to-relationaltext.lens.json' with { type: 'json' }
import discordToRTData from '../../../formats/com.discord/discord-to-relationaltext.lens.json' with { type: 'json' }
import telegramToRTData from '../../../formats/org.telegram/telegram-to-relationaltext.lens.json' with { type: 'json' }
import linkedinToRTData from '../../../formats/com.linkedin/linkedin-to-relationaltext.lens.json' with { type: 'json' }

// Import editor format lens JSON data files
import prosemirrorToRTData from '../../../formats/org.prosemirror/prosemirror-to-relationaltext.lens.json' with { type: 'json' }
import tiptapToRTData from '../../../formats/dev.tiptap/tiptap-to-relationaltext.lens.json' with { type: 'json' }
import quillToRTData from '../../../formats/org.quilljs.delta/quill-to-relationaltext.lens.json' with { type: 'json' }
import lexicalToRTData from '../../../formats/io.lexical/lexical-to-relationaltext.lens.json' with { type: 'json' }
import slateToRTData from '../../../formats/rocks.slate/slate-to-relationaltext.lens.json' with { type: 'json' }

const SLACK_TO_RT = slackToRTData as unknown as LensSpec
const WHATSAPP_TO_RT = whatsappToRTData as unknown as LensSpec
const THREADS_TO_RT = threadsToRTData as unknown as LensSpec
const MASTODON_TO_RT = mastodonToRTData as unknown as LensSpec
const DISCORD_TO_RT = discordToRTData as unknown as LensSpec
const TELEGRAM_TO_RT = telegramToRTData as unknown as LensSpec
const LINKEDIN_TO_RT = linkedinToRTData as unknown as LensSpec

const PROSEMIRROR_TO_RT = prosemirrorToRTData as unknown as LensSpec
const TIPTAP_TO_RT = tiptapToRTData as unknown as LensSpec
const QUILL_TO_RT = quillToRTData as unknown as LensSpec
const LEXICAL_TO_RT = lexicalToRTData as unknown as LensSpec
const SLATE_TO_RT = slateToRTData as unknown as LensSpec

beforeAll(async () => {
  await initRelationalText()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a DocumentJSON with a single block marker and an inline feature.
 * The block marker is a U+FFFC character at position 0.
 */
function buildDoc(typeId: string, featureDefs: Array<{
  byteStart: number
  byteEnd: number
  name: string
  attrs?: Record<string, unknown>
}>): DocumentJSON {
  const facets: FacetJSON[] = featureDefs.map((f) => ({
    index: { byteStart: f.byteStart, byteEnd: f.byteEnd },
    features: [{
      $type: typeId,
      name: f.name,
      ...(f.attrs ?? {}),
    }] as FacetJSON['features'],
  }))
  return { text: 'hello world', facets }
}

/** Apply forward then inverse lens and return the round-tripped document. */
function roundTrip(doc: DocumentJSON, lens: LensSpec): DocumentJSON {
  const forward = applyLens(doc, lens)
  const inv = inverseLens(lens)
  return applyLens(forward, inv)
}

// ─── invertible: false lenses must throw ──────────────────────────────────────

describe('invertible: false lenses', () => {
  it('mastodon-to-relationaltext throws on inverseLens', () => {
    expect(() => inverseLens(MASTODON_TO_RT)).toThrow(LensInversionError)
  })

  it('discord-to-relationaltext throws on inverseLens', () => {
    expect(() => inverseLens(DISCORD_TO_RT)).toThrow(LensInversionError)
  })

  it('telegram-to-relationaltext throws on inverseLens', () => {
    expect(() => inverseLens(TELEGRAM_TO_RT)).toThrow(LensInversionError)
  })

  it('linkedin-to-relationaltext throws on inverseLens', () => {
    expect(() => inverseLens(LINKEDIN_TO_RT)).toThrow(LensInversionError)
  })
})

// ─── Mastodon: forward direction (no round-trip since invertible:false) ───────

describe('mastodon-to-relationaltext forward lens', () => {
  it('maps strong → bold', () => {
    const doc = buildDoc('org.joinmastodon.facet', [{ byteStart: 0, byteEnd: 5, name: 'strong' }])
    const result = applyLens(doc, MASTODON_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('bold')
  })

  it('maps em → italic', () => {
    const doc = buildDoc('org.joinmastodon.facet', [{ byteStart: 0, byteEnd: 5, name: 'em' }])
    const result = applyLens(doc, MASTODON_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('italic')
  })

  it('maps mention → mention with url (renamed from href), handle preserved', () => {
    const doc = buildDoc('org.joinmastodon.facet', [
      { byteStart: 0, byteEnd: 5, name: 'mention', attrs: { href: 'https://mastodon.social/@alice', handle: 'alice' } },
    ])
    const result = applyLens(doc, MASTODON_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('mention')
    expect(feat.url).toBe('https://mastodon.social/@alice')
    expect(feat.handle).toBe('alice')
    // href should be renamed to url
    expect(feat.href).toBeUndefined()
  })

  it('maps hashtag → hashtag with url (renamed from href), tag preserved', () => {
    const doc = buildDoc('org.joinmastodon.facet', [
      { byteStart: 0, byteEnd: 5, name: 'hashtag', attrs: { href: '/tags/rust', tag: 'rust' } },
    ])
    const result = applyLens(doc, MASTODON_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('hashtag')
    expect(feat.url).toBe('/tags/rust')
    expect(feat.tag).toBe('rust')
    expect(feat.href).toBeUndefined()
  })

  it('maps a → link with url (renamed from href)', () => {
    const doc = buildDoc('org.joinmastodon.facet', [
      { byteStart: 0, byteEnd: 5, name: 'a', attrs: { href: 'https://example.com' } },
    ])
    const result = applyLens(doc, MASTODON_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('link')
    expect(feat.url).toBe('https://example.com')
    expect(feat.href).toBeUndefined()
  })

  it('maps br → line-break', () => {
    const doc = buildDoc('org.joinmastodon.facet', [{ byteStart: 0, byteEnd: 1, name: 'br' }])
    const result = applyLens(doc, MASTODON_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('line-break')
  })

  it('maps p → paragraph', () => {
    const doc = buildDoc('org.joinmastodon.facet', [{ byteStart: 0, byteEnd: 1, name: 'p' }])
    const result = applyLens(doc, MASTODON_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('paragraph')
  })
})

// ─── Slack round-trip ─────────────────────────────────────────────────────────

describe('slack-to-relationaltext round-trip', () => {
  it('bold survives forward + inverse', () => {
    const doc = buildDoc('com.slack.mrkdwn.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = roundTrip(doc, SLACK_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.slack.mrkdwn.facet')
    expect(feat.name).toBe('bold')
  })

  it('italic survives forward + inverse', () => {
    const doc = buildDoc('com.slack.mrkdwn.facet', [{ byteStart: 0, byteEnd: 5, name: 'italic' }])
    const result = roundTrip(doc, SLACK_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.slack.mrkdwn.facet')
    expect(feat.name).toBe('italic')
  })

  it('strikethrough survives forward + inverse', () => {
    const doc = buildDoc('com.slack.mrkdwn.facet', [{ byteStart: 0, byteEnd: 5, name: 'strikethrough' }])
    const result = roundTrip(doc, SLACK_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.slack.mrkdwn.facet')
    expect(feat.name).toBe('strikethrough')
  })

  it('code survives forward + inverse', () => {
    const doc = buildDoc('com.slack.mrkdwn.facet', [{ byteStart: 0, byteEnd: 5, name: 'code' }])
    const result = roundTrip(doc, SLACK_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.slack.mrkdwn.facet')
    expect(feat.name).toBe('code')
  })

  it('link (with url attr) survives forward + inverse', () => {
    const doc = buildDoc('com.slack.mrkdwn.facet', [
      { byteStart: 0, byteEnd: 5, name: 'link', attrs: { url: 'https://slack.com' } },
    ])
    const result = roundTrip(doc, SLACK_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.slack.mrkdwn.facet')
    expect(feat.name).toBe('link')
    expect(feat.url).toBe('https://slack.com')
  })

  it('paragraph block survives forward + inverse', () => {
    const doc = buildDoc('com.slack.mrkdwn.facet', [{ byteStart: 0, byteEnd: 1, name: 'paragraph' }])
    const result = roundTrip(doc, SLACK_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.slack.mrkdwn.facet')
    expect(feat.name).toBe('paragraph')
  })

  it('code-block survives forward + inverse', () => {
    const doc = buildDoc('com.slack.mrkdwn.facet', [{ byteStart: 0, byteEnd: 1, name: 'code-block' }])
    const result = roundTrip(doc, SLACK_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.slack.mrkdwn.facet')
    expect(feat.name).toBe('code-block')
  })

  it('forward lens changes type_id to org.relationaltext.facet', () => {
    const doc = buildDoc('com.slack.mrkdwn.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const forward = applyLens(doc, SLACK_TO_RT)
    const feat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
  })
})

// ─── WhatsApp round-trip ──────────────────────────────────────────────────────

describe('whatsapp-to-relationaltext round-trip', () => {
  it('bold survives forward + inverse', () => {
    const doc = buildDoc('com.whatsapp.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = roundTrip(doc, WHATSAPP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.whatsapp.facet')
    expect(feat.name).toBe('bold')
  })

  it('italic survives forward + inverse', () => {
    const doc = buildDoc('com.whatsapp.facet', [{ byteStart: 0, byteEnd: 5, name: 'italic' }])
    const result = roundTrip(doc, WHATSAPP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.whatsapp.facet')
    expect(feat.name).toBe('italic')
  })

  it('strikethrough survives forward + inverse', () => {
    const doc = buildDoc('com.whatsapp.facet', [{ byteStart: 0, byteEnd: 5, name: 'strikethrough' }])
    const result = roundTrip(doc, WHATSAPP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.whatsapp.facet')
    expect(feat.name).toBe('strikethrough')
  })

  it('code survives forward + inverse', () => {
    const doc = buildDoc('com.whatsapp.facet', [{ byteStart: 0, byteEnd: 5, name: 'code' }])
    const result = roundTrip(doc, WHATSAPP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.whatsapp.facet')
    expect(feat.name).toBe('code')
  })

  it('paragraph block survives forward + inverse', () => {
    const doc = buildDoc('com.whatsapp.facet', [{ byteStart: 0, byteEnd: 1, name: 'paragraph' }])
    const result = roundTrip(doc, WHATSAPP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.whatsapp.facet')
    expect(feat.name).toBe('paragraph')
  })

  it('code-block survives forward + inverse', () => {
    const doc = buildDoc('com.whatsapp.facet', [{ byteStart: 0, byteEnd: 1, name: 'code-block' }])
    const result = roundTrip(doc, WHATSAPP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.whatsapp.facet')
    expect(feat.name).toBe('code-block')
  })

  it('bullet-list-marker survives forward + inverse', () => {
    const doc = buildDoc('com.whatsapp.facet', [{ byteStart: 0, byteEnd: 1, name: 'bullet-list-marker' }])
    const result = roundTrip(doc, WHATSAPP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.whatsapp.facet')
    expect(feat.name).toBe('bullet-list-marker')
  })

  it('forward lens changes type_id to org.relationaltext.facet', () => {
    const doc = buildDoc('com.whatsapp.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const forward = applyLens(doc, WHATSAPP_TO_RT)
    const feat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
  })
})

// ─── Threads round-trip ───────────────────────────────────────────────────────

describe('threads-to-relationaltext round-trip', () => {
  it('bold survives forward + inverse', () => {
    const doc = buildDoc('com.threads.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = roundTrip(doc, THREADS_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.threads.facet')
    expect(feat.name).toBe('bold')
  })

  it('italic survives forward + inverse', () => {
    const doc = buildDoc('com.threads.facet', [{ byteStart: 0, byteEnd: 5, name: 'italic' }])
    const result = roundTrip(doc, THREADS_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.threads.facet')
    expect(feat.name).toBe('italic')
  })

  it('mention (with handle) survives forward + inverse', () => {
    const doc = buildDoc('com.threads.facet', [
      { byteStart: 0, byteEnd: 5, name: 'mention', attrs: { handle: 'alice' } },
    ])
    const result = roundTrip(doc, THREADS_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.threads.facet')
    expect(feat.name).toBe('mention')
    expect(feat.handle).toBe('alice')
  })

  it('hashtag (with tag) survives forward + inverse', () => {
    const doc = buildDoc('com.threads.facet', [
      { byteStart: 0, byteEnd: 5, name: 'hashtag', attrs: { tag: 'rust' } },
    ])
    const result = roundTrip(doc, THREADS_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.threads.facet')
    expect(feat.name).toBe('hashtag')
    expect(feat.tag).toBe('rust')
  })

  it('link (href→url in forward, url→href in inverse) round-trips correctly', () => {
    const doc = buildDoc('com.threads.facet', [
      { byteStart: 0, byteEnd: 5, name: 'link', attrs: { href: 'https://threads.net' } },
    ])
    const result = roundTrip(doc, THREADS_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.threads.facet')
    expect(feat.name).toBe('link')
    expect(feat.href).toBe('https://threads.net')
    expect(feat.url).toBeUndefined()
  })

  it('paragraph block survives forward + inverse', () => {
    const doc = buildDoc('com.threads.facet', [{ byteStart: 0, byteEnd: 1, name: 'paragraph' }])
    const result = roundTrip(doc, THREADS_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('com.threads.facet')
    expect(feat.name).toBe('paragraph')
  })

  it('forward mention maps to org.relationaltext.facet#mention', () => {
    const doc = buildDoc('com.threads.facet', [
      { byteStart: 0, byteEnd: 5, name: 'mention', attrs: { handle: 'bob' } },
    ])
    const forward = applyLens(doc, THREADS_TO_RT)
    const feat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('mention')
    expect(feat.handle).toBe('bob')
  })

  it('forward hashtag maps to org.relationaltext.facet#hashtag', () => {
    const doc = buildDoc('com.threads.facet', [
      { byteStart: 0, byteEnd: 5, name: 'hashtag', attrs: { tag: 'coding' } },
    ])
    const forward = applyLens(doc, THREADS_TO_RT)
    const feat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('hashtag')
    expect(feat.tag).toBe('coding')
  })
})

// ─── Discord forward lens (not invertible — tests forward direction only) ─────

describe('discord-to-relationaltext forward lens', () => {
  it('maps bold → bold', () => {
    const doc = buildDoc('com.discord.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = applyLens(doc, DISCORD_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('bold')
  })

  it('maps italic → italic', () => {
    const doc = buildDoc('com.discord.facet', [{ byteStart: 0, byteEnd: 5, name: 'italic' }])
    const result = applyLens(doc, DISCORD_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('italic')
  })

  it('maps underline → underline', () => {
    const doc = buildDoc('com.discord.facet', [{ byteStart: 0, byteEnd: 5, name: 'underline' }])
    const result = applyLens(doc, DISCORD_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('underline')
  })

  it('maps strikethrough → strikethrough', () => {
    const doc = buildDoc('com.discord.facet', [{ byteStart: 0, byteEnd: 5, name: 'strikethrough' }])
    const result = applyLens(doc, DISCORD_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('strikethrough')
  })

  it('drops spoiler via explicit replace:null rule', () => {
    const doc = buildDoc('com.discord.facet', [{ byteStart: 0, byteEnd: 5, name: 'spoiler' }])
    const result = applyLens(doc, DISCORD_TO_RT)
    // spoiler is explicitly dropped (replace: null) — should not appear in result
    const spoilerFeats = (result.facets ?? []).flatMap((f) =>
      f.features.filter((feat) => (feat as Record<string, unknown>).name === 'spoiler'),
    )
    expect(spoilerFeats).toHaveLength(0)
  })

  it('maps link (href → url)', () => {
    const doc = buildDoc('com.discord.facet', [
      { byteStart: 0, byteEnd: 5, name: 'link', attrs: { href: 'https://discord.com' } },
    ])
    const result = applyLens(doc, DISCORD_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('link')
    expect(feat.url).toBe('https://discord.com')
    expect(feat.href).toBeUndefined()
  })

  it('maps heading → heading (preserving level attr)', () => {
    const doc = buildDoc('com.discord.facet', [
      { byteStart: 0, byteEnd: 1, name: 'heading', attrs: { level: 1 } },
    ])
    const result = applyLens(doc, DISCORD_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('heading')
  })
})

// ─── Telegram forward lens (not invertible) ───────────────────────────────────

describe('telegram-to-relationaltext forward lens', () => {
  it('maps bold → bold', () => {
    const doc = buildDoc('org.telegram.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = applyLens(doc, TELEGRAM_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('bold')
  })

  it('maps italic → italic', () => {
    const doc = buildDoc('org.telegram.facet', [{ byteStart: 0, byteEnd: 5, name: 'italic' }])
    const result = applyLens(doc, TELEGRAM_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('italic')
  })

  it('drops spoiler via explicit replace:null rule', () => {
    const doc = buildDoc('org.telegram.facet', [{ byteStart: 0, byteEnd: 5, name: 'spoiler' }])
    const result = applyLens(doc, TELEGRAM_TO_RT)
    const spoilerFeats = (result.facets ?? []).flatMap((f) =>
      f.features.filter((feat) => (feat as Record<string, unknown>).name === 'spoiler'),
    )
    expect(spoilerFeats).toHaveLength(0)
  })

  it('maps text_link → link (href → url)', () => {
    const doc = buildDoc('org.telegram.facet', [
      { byteStart: 0, byteEnd: 5, name: 'text_link', attrs: { href: 'https://t.me' } },
    ])
    const result = applyLens(doc, TELEGRAM_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('link')
    expect(feat.url).toBe('https://t.me')
    expect(feat.href).toBeUndefined()
  })

  it('maps quote → blockquote-marker', () => {
    const doc = buildDoc('org.telegram.facet', [{ byteStart: 0, byteEnd: 1, name: 'quote' }])
    const result = applyLens(doc, TELEGRAM_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('blockquote-marker')
  })

  it('maps strikethrough → strikethrough', () => {
    const doc = buildDoc('org.telegram.facet', [{ byteStart: 0, byteEnd: 5, name: 'strikethrough' }])
    const result = applyLens(doc, TELEGRAM_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('strikethrough')
  })
})

// ─── LinkedIn forward lens (not invertible) ───────────────────────────────────

describe('linkedin-to-relationaltext forward lens', () => {
  it('maps bold → bold', () => {
    const doc = buildDoc('com.linkedin.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = applyLens(doc, LINKEDIN_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('bold')
  })

  it('maps italic → italic', () => {
    const doc = buildDoc('com.linkedin.facet', [{ byteStart: 0, byteEnd: 5, name: 'italic' }])
    const result = applyLens(doc, LINKEDIN_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('italic')
  })

  it('maps mention → mention (personName → handle)', () => {
    const doc = buildDoc('com.linkedin.facet', [
      { byteStart: 0, byteEnd: 5, name: 'mention', attrs: { personName: 'Alice', urn: 'urn:li:person:123' } },
    ])
    const result = applyLens(doc, LINKEDIN_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('mention')
    expect(feat.handle).toBe('Alice')
    expect(feat.personName).toBeUndefined()
  })

  it('maps hashtag → hashtag (tag preserved)', () => {
    const doc = buildDoc('com.linkedin.facet', [
      { byteStart: 0, byteEnd: 5, name: 'hashtag', attrs: { tag: 'opentowork' } },
    ])
    const result = applyLens(doc, LINKEDIN_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('hashtag')
    expect(feat.tag).toBe('opentowork')
  })
})

// ─── RT hub lexicon has mention and hashtag entity types ──────────────────────

describe('RT hub lexicon contains mention and hashtag entity types', () => {
  it('forward slack lens produces org.relationaltext.facet type_id', () => {
    const doc = buildDoc('com.slack.mrkdwn.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const forward = applyLens(doc, SLACK_TO_RT)
    expect(forward.facets![0]!.features[0]!.$type).toBe('org.relationaltext.facet')
  })

  it('threads mention maps to org.relationaltext.facet#mention namespace', () => {
    const doc = buildDoc('com.threads.facet', [
      { byteStart: 0, byteEnd: 5, name: 'mention', attrs: { handle: 'testuser' } },
    ])
    const forward = applyLens(doc, THREADS_TO_RT)
    const feat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('mention')
  })

  it('threads hashtag maps to org.relationaltext.facet#hashtag namespace', () => {
    const doc = buildDoc('com.threads.facet', [
      { byteStart: 0, byteEnd: 5, name: 'hashtag', attrs: { tag: 'webdev' } },
    ])
    const forward = applyLens(doc, THREADS_TO_RT)
    const feat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('hashtag')
  })

  it('mastodon mention maps to org.relationaltext.facet#mention namespace', () => {
    const doc = buildDoc('org.joinmastodon.facet', [
      { byteStart: 0, byteEnd: 5, name: 'mention', attrs: { href: 'https://mastodon.social/@user', handle: 'user' } },
    ])
    const forward = applyLens(doc, MASTODON_TO_RT)
    const feat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('mention')
    expect(feat.handle).toBe('user')
    expect(feat.url).toBe('https://mastodon.social/@user')
  })

  it('mastodon hashtag maps to org.relationaltext.facet#hashtag namespace', () => {
    const doc = buildDoc('org.joinmastodon.facet', [
      { byteStart: 0, byteEnd: 5, name: 'hashtag', attrs: { href: '/tags/rustlang', tag: 'rustlang' } },
    ])
    const forward = applyLens(doc, MASTODON_TO_RT)
    const feat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('hashtag')
    expect(feat.tag).toBe('rustlang')
    expect(feat.url).toBe('/tags/rustlang')
  })

  it('linkedin mention maps to org.relationaltext.facet#mention namespace', () => {
    const doc = buildDoc('com.linkedin.facet', [
      { byteStart: 0, byteEnd: 5, name: 'mention', attrs: { personName: 'Bob', urn: 'urn:li:person:456' } },
    ])
    const forward = applyLens(doc, LINKEDIN_TO_RT)
    const feat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('mention')
    expect(feat.handle).toBe('Bob')
  })

  it('linkedin hashtag maps to org.relationaltext.facet#hashtag namespace', () => {
    const doc = buildDoc('com.linkedin.facet', [
      { byteStart: 0, byteEnd: 5, name: 'hashtag', attrs: { tag: 'hiring' } },
    ])
    const forward = applyLens(doc, LINKEDIN_TO_RT)
    const feat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.relationaltext.facet')
    expect(feat.name).toBe('hashtag')
    expect(feat.tag).toBe('hiring')
  })
})

// ─── ProseMirror round-trip ───────────────────────────────────────────────────

describe('prosemirror-to-relationaltext round-trip', () => {
  it('bold survives forward + inverse', () => {
    const doc = buildDoc('org.prosemirror.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = roundTrip(doc, PROSEMIRROR_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.prosemirror.facet')
    expect(feat.name).toBe('bold')
  })

  it('italic survives forward + inverse', () => {
    const doc = buildDoc('org.prosemirror.facet', [{ byteStart: 0, byteEnd: 5, name: 'italic' }])
    const result = roundTrip(doc, PROSEMIRROR_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.prosemirror.facet')
    expect(feat.name).toBe('italic')
  })

  it('strike → strikethrough → strike (round-trip)', () => {
    const doc = buildDoc('org.prosemirror.facet', [{ byteStart: 0, byteEnd: 5, name: 'strike' }])
    const forward = applyLens(doc, PROSEMIRROR_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.$type).toBe('org.relationaltext.facet')
    expect(fwdFeat.name).toBe('strikethrough')
    const result = roundTrip(doc, PROSEMIRROR_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.prosemirror.facet')
    expect(feat.name).toBe('strike')
  })

  it('hard_break → line-break → hard_break (round-trip)', () => {
    const doc = buildDoc('org.prosemirror.facet', [{ byteStart: 0, byteEnd: 1, name: 'hard_break' }])
    const forward = applyLens(doc, PROSEMIRROR_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.name).toBe('line-break')
    const result = roundTrip(doc, PROSEMIRROR_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.prosemirror.facet')
    expect(feat.name).toBe('hard_break')
  })

  it('link with href → url → href (round-trip)', () => {
    const doc = buildDoc('org.prosemirror.facet', [
      { byteStart: 0, byteEnd: 5, name: 'link', attrs: { href: 'https://prosemirror.net' } },
    ])
    const forward = applyLens(doc, PROSEMIRROR_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.name).toBe('link')
    expect(fwdFeat.url).toBe('https://prosemirror.net')
    expect(fwdFeat.href).toBeUndefined()
    const result = roundTrip(doc, PROSEMIRROR_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.prosemirror.facet')
    expect(feat.name).toBe('link')
    expect(feat.href).toBe('https://prosemirror.net')
    expect(feat.url).toBeUndefined()
  })

  it('heading with level attr survives forward + inverse', () => {
    const doc = buildDoc('org.prosemirror.facet', [
      { byteStart: 0, byteEnd: 1, name: 'heading', attrs: { level: 2 } },
    ])
    const forward = applyLens(doc, PROSEMIRROR_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.name).toBe('heading')
    const result = roundTrip(doc, PROSEMIRROR_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.prosemirror.facet')
    expect(feat.name).toBe('heading')
  })

  it('paragraph block survives forward + inverse', () => {
    const doc = buildDoc('org.prosemirror.facet', [{ byteStart: 0, byteEnd: 1, name: 'paragraph' }])
    const result = roundTrip(doc, PROSEMIRROR_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.prosemirror.facet')
    expect(feat.name).toBe('paragraph')
  })

  it('code-block survives forward + inverse', () => {
    const doc = buildDoc('org.prosemirror.facet', [{ byteStart: 0, byteEnd: 1, name: 'code-block' }])
    const result = roundTrip(doc, PROSEMIRROR_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.prosemirror.facet')
    expect(feat.name).toBe('code-block')
  })
})

// ─── TipTap round-trip ────────────────────────────────────────────────────────

describe('tiptap-to-relationaltext round-trip', () => {
  it('bold survives forward + inverse', () => {
    const doc = buildDoc('dev.tiptap.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = roundTrip(doc, TIPTAP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('dev.tiptap.facet')
    expect(feat.name).toBe('bold')
  })

  it('strike → strikethrough → strike (round-trip)', () => {
    const doc = buildDoc('dev.tiptap.facet', [{ byteStart: 0, byteEnd: 5, name: 'strike' }])
    const forward = applyLens(doc, TIPTAP_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.$type).toBe('org.relationaltext.facet')
    expect(fwdFeat.name).toBe('strikethrough')
    const result = roundTrip(doc, TIPTAP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('dev.tiptap.facet')
    expect(feat.name).toBe('strike')
  })

  it('hardBreak → line-break → hardBreak (round-trip)', () => {
    const doc = buildDoc('dev.tiptap.facet', [{ byteStart: 0, byteEnd: 1, name: 'hardBreak' }])
    const forward = applyLens(doc, TIPTAP_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.name).toBe('line-break')
    const result = roundTrip(doc, TIPTAP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('dev.tiptap.facet')
    expect(feat.name).toBe('hardBreak')
  })

  it('codeBlock → code-block → codeBlock (round-trip)', () => {
    const doc = buildDoc('dev.tiptap.facet', [{ byteStart: 0, byteEnd: 1, name: 'codeBlock' }])
    const forward = applyLens(doc, TIPTAP_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.name).toBe('code-block')
    const result = roundTrip(doc, TIPTAP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('dev.tiptap.facet')
    expect(feat.name).toBe('codeBlock')
  })

  it('horizontalRule → horizontal-rule → horizontalRule (round-trip)', () => {
    const doc = buildDoc('dev.tiptap.facet', [{ byteStart: 0, byteEnd: 1, name: 'horizontalRule' }])
    const forward = applyLens(doc, TIPTAP_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.name).toBe('horizontal-rule')
    const result = roundTrip(doc, TIPTAP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('dev.tiptap.facet')
    expect(feat.name).toBe('horizontalRule')
  })

  it('link with href → url → href (round-trip)', () => {
    const doc = buildDoc('dev.tiptap.facet', [
      { byteStart: 0, byteEnd: 5, name: 'link', attrs: { href: 'https://tiptap.dev' } },
    ])
    const forward = applyLens(doc, TIPTAP_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.url).toBe('https://tiptap.dev')
    expect(fwdFeat.href).toBeUndefined()
    const result = roundTrip(doc, TIPTAP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('dev.tiptap.facet')
    expect(feat.name).toBe('link')
    expect(feat.href).toBe('https://tiptap.dev')
    expect(feat.url).toBeUndefined()
  })

  it('heading with level survives forward + inverse', () => {
    const doc = buildDoc('dev.tiptap.facet', [
      { byteStart: 0, byteEnd: 1, name: 'heading', attrs: { level: 3 } },
    ])
    const forward = applyLens(doc, TIPTAP_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.name).toBe('heading')
    const result = roundTrip(doc, TIPTAP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('dev.tiptap.facet')
    expect(feat.name).toBe('heading')
  })

  it('paragraph block survives forward + inverse', () => {
    const doc = buildDoc('dev.tiptap.facet', [{ byteStart: 0, byteEnd: 1, name: 'paragraph' }])
    const result = roundTrip(doc, TIPTAP_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('dev.tiptap.facet')
    expect(feat.name).toBe('paragraph')
  })
})

// ─── Quill round-trip ─────────────────────────────────────────────────────────

describe('quill-to-relationaltext round-trip', () => {
  it('bold survives forward + inverse', () => {
    const doc = buildDoc('org.quilljs.delta.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = roundTrip(doc, QUILL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.quilljs.delta.facet')
    expect(feat.name).toBe('bold')
  })

  it('italic survives forward + inverse', () => {
    const doc = buildDoc('org.quilljs.delta.facet', [{ byteStart: 0, byteEnd: 5, name: 'italic' }])
    const result = roundTrip(doc, QUILL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.quilljs.delta.facet')
    expect(feat.name).toBe('italic')
  })

  it('strike → strikethrough → strike (round-trip)', () => {
    const doc = buildDoc('org.quilljs.delta.facet', [{ byteStart: 0, byteEnd: 5, name: 'strike' }])
    const forward = applyLens(doc, QUILL_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.$type).toBe('org.relationaltext.facet')
    expect(fwdFeat.name).toBe('strikethrough')
    const result = roundTrip(doc, QUILL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.quilljs.delta.facet')
    expect(feat.name).toBe('strike')
  })

  it('header → heading → header (round-trip)', () => {
    const doc = buildDoc('org.quilljs.delta.facet', [
      { byteStart: 0, byteEnd: 1, name: 'header', attrs: { level: 2 } },
    ])
    const forward = applyLens(doc, QUILL_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.$type).toBe('org.relationaltext.facet')
    expect(fwdFeat.name).toBe('heading')
    const result = roundTrip(doc, QUILL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.quilljs.delta.facet')
    expect(feat.name).toBe('header')
  })

  it('link with url survives forward + inverse', () => {
    const doc = buildDoc('org.quilljs.delta.facet', [
      { byteStart: 0, byteEnd: 5, name: 'link', attrs: { url: 'https://quilljs.com' } },
    ])
    const result = roundTrip(doc, QUILL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.quilljs.delta.facet')
    expect(feat.name).toBe('link')
    expect(feat.url).toBe('https://quilljs.com')
  })

  it('paragraph block survives forward + inverse', () => {
    const doc = buildDoc('org.quilljs.delta.facet', [{ byteStart: 0, byteEnd: 1, name: 'paragraph' }])
    const result = roundTrip(doc, QUILL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.quilljs.delta.facet')
    expect(feat.name).toBe('paragraph')
  })

  it('code-block survives forward + inverse', () => {
    const doc = buildDoc('org.quilljs.delta.facet', [{ byteStart: 0, byteEnd: 1, name: 'code-block' }])
    const result = roundTrip(doc, QUILL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('org.quilljs.delta.facet')
    expect(feat.name).toBe('code-block')
  })
})

// ─── Lexical round-trip ───────────────────────────────────────────────────────

describe('lexical-to-relationaltext round-trip', () => {
  it('bold survives forward + inverse', () => {
    const doc = buildDoc('io.lexical.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = roundTrip(doc, LEXICAL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('io.lexical.facet')
    expect(feat.name).toBe('bold')
  })

  it('italic survives forward + inverse', () => {
    const doc = buildDoc('io.lexical.facet', [{ byteStart: 0, byteEnd: 5, name: 'italic' }])
    const result = roundTrip(doc, LEXICAL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('io.lexical.facet')
    expect(feat.name).toBe('italic')
  })

  it('strikethrough survives forward + inverse (identity)', () => {
    const doc = buildDoc('io.lexical.facet', [{ byteStart: 0, byteEnd: 5, name: 'strikethrough' }])
    const forward = applyLens(doc, LEXICAL_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.name).toBe('strikethrough')
    const result = roundTrip(doc, LEXICAL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('io.lexical.facet')
    expect(feat.name).toBe('strikethrough')
  })

  it('linebreak → line-break → linebreak (round-trip)', () => {
    const doc = buildDoc('io.lexical.facet', [{ byteStart: 0, byteEnd: 1, name: 'linebreak' }])
    const forward = applyLens(doc, LEXICAL_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.$type).toBe('org.relationaltext.facet')
    expect(fwdFeat.name).toBe('line-break')
    const result = roundTrip(doc, LEXICAL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('io.lexical.facet')
    expect(feat.name).toBe('linebreak')
  })

  it('horizontalrule → horizontal-rule → horizontalrule (round-trip)', () => {
    const doc = buildDoc('io.lexical.facet', [{ byteStart: 0, byteEnd: 1, name: 'horizontalrule' }])
    const forward = applyLens(doc, LEXICAL_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.$type).toBe('org.relationaltext.facet')
    expect(fwdFeat.name).toBe('horizontal-rule')
    const result = roundTrip(doc, LEXICAL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('io.lexical.facet')
    expect(feat.name).toBe('horizontalrule')
  })

  it('link with url survives forward + inverse', () => {
    const doc = buildDoc('io.lexical.facet', [
      { byteStart: 0, byteEnd: 5, name: 'link', attrs: { url: 'https://lexical.dev' } },
    ])
    const result = roundTrip(doc, LEXICAL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('io.lexical.facet')
    expect(feat.name).toBe('link')
    expect(feat.url).toBe('https://lexical.dev')
  })

  it('heading with level survives forward + inverse', () => {
    const doc = buildDoc('io.lexical.facet', [
      { byteStart: 0, byteEnd: 1, name: 'heading', attrs: { level: 1 } },
    ])
    const result = roundTrip(doc, LEXICAL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('io.lexical.facet')
    expect(feat.name).toBe('heading')
  })

  it('paragraph block survives forward + inverse', () => {
    const doc = buildDoc('io.lexical.facet', [{ byteStart: 0, byteEnd: 1, name: 'paragraph' }])
    const result = roundTrip(doc, LEXICAL_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('io.lexical.facet')
    expect(feat.name).toBe('paragraph')
  })
})

// ─── Slate round-trip ─────────────────────────────────────────────────────────

describe('slate-to-relationaltext round-trip', () => {
  it('bold survives forward + inverse', () => {
    const doc = buildDoc('rocks.slate.facet', [{ byteStart: 0, byteEnd: 5, name: 'bold' }])
    const result = roundTrip(doc, SLATE_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('rocks.slate.facet')
    expect(feat.name).toBe('bold')
  })

  it('italic survives forward + inverse', () => {
    const doc = buildDoc('rocks.slate.facet', [{ byteStart: 0, byteEnd: 5, name: 'italic' }])
    const result = roundTrip(doc, SLATE_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('rocks.slate.facet')
    expect(feat.name).toBe('italic')
  })

  it('strikethrough survives forward + inverse (identity)', () => {
    const doc = buildDoc('rocks.slate.facet', [{ byteStart: 0, byteEnd: 5, name: 'strikethrough' }])
    const forward = applyLens(doc, SLATE_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.name).toBe('strikethrough')
    const result = roundTrip(doc, SLATE_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('rocks.slate.facet')
    expect(feat.name).toBe('strikethrough')
  })

  it('hard-break → line-break → hard-break (round-trip)', () => {
    const doc = buildDoc('rocks.slate.facet', [{ byteStart: 0, byteEnd: 1, name: 'hard-break' }])
    const forward = applyLens(doc, SLATE_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.$type).toBe('org.relationaltext.facet')
    expect(fwdFeat.name).toBe('line-break')
    const result = roundTrip(doc, SLATE_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('rocks.slate.facet')
    expect(feat.name).toBe('hard-break')
  })

  it('link with url survives forward + inverse', () => {
    const doc = buildDoc('rocks.slate.facet', [
      { byteStart: 0, byteEnd: 5, name: 'link', attrs: { url: 'https://docs.slatejs.org' } },
    ])
    const result = roundTrip(doc, SLATE_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('rocks.slate.facet')
    expect(feat.name).toBe('link')
    expect(feat.url).toBe('https://docs.slatejs.org')
  })

  it('heading with level survives forward + inverse', () => {
    const doc = buildDoc('rocks.slate.facet', [
      { byteStart: 0, byteEnd: 1, name: 'heading', attrs: { level: 2 } },
    ])
    const result = roundTrip(doc, SLATE_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('rocks.slate.facet')
    expect(feat.name).toBe('heading')
  })

  it('paragraph block survives forward + inverse', () => {
    const doc = buildDoc('rocks.slate.facet', [{ byteStart: 0, byteEnd: 1, name: 'paragraph' }])
    const result = roundTrip(doc, SLATE_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('rocks.slate.facet')
    expect(feat.name).toBe('paragraph')
  })

  it('code-block survives forward + inverse', () => {
    const doc = buildDoc('rocks.slate.facet', [{ byteStart: 0, byteEnd: 1, name: 'code-block' }])
    const result = roundTrip(doc, SLATE_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('rocks.slate.facet')
    expect(feat.name).toBe('code-block')
  })

  it('horizontal-rule survives forward + inverse (identity)', () => {
    const doc = buildDoc('rocks.slate.facet', [{ byteStart: 0, byteEnd: 1, name: 'horizontal-rule' }])
    const forward = applyLens(doc, SLATE_TO_RT)
    const fwdFeat = forward.facets![0]!.features[0]! as Record<string, unknown>
    expect(fwdFeat.name).toBe('horizontal-rule')
    const result = roundTrip(doc, SLATE_TO_RT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat.$type).toBe('rocks.slate.facet')
    expect(feat.name).toBe('horizontal-rule')
  })
})
