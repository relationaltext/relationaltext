# SQL Engine Examples

## Mastodon Mention Detection

The most complete real-world example: detect Mastodon's mention microformat (a `<span class="h-card">` wrapping an `<a class="u-url mention">`) and collapse it into a single `mention` feature.

```ts
import { from } from 'relational-text'
import { applyFacetSQL } from 'relational-text/sql'

const html = `
  <p>Hello
    <span class="h-card">
      <a href="https://mastodon.social/@alice" class="u-url mention">@alice</a>
    </span>!
  </p>
`

const doc = from('html', html)
const detected = applyFacetSQL(doc, `
  -- Synthesize a mention feature by joining the h-card span and its inner anchor
  INSERT INTO features (byte_start, byte_end, type_id, name, data)
  SELECT
    span.byte_start,
    span.byte_end,
    'org.joinmastodon.facet',
    'mention',
    json_object(
      'href',   json_get(a.data, 'href'),
      'handle', ltrim(text_at(span.byte_start, span.byte_end), '@')
    )
  FROM features AS span
  JOIN features AS a
    ON  a.byte_start = span.byte_start
    AND a.byte_end   = span.byte_end
  WHERE span.name = 'span'  AND class_contains(span.data, 'h-card')
    AND a.name   = 'a'      AND class_contains(a.data, 'u-url');

  -- Remove the now-redundant h-card span and u-url anchor
  DELETE FROM features WHERE name = 'span' AND class_contains(data, 'h-card');
  DELETE FROM features WHERE name = 'a'    AND class_contains(data, 'u-url');
`)
```

**How this works:**

1. **`FROM features AS span`** — scan all features, aliasing each row as `span`
2. **`JOIN features AS a ON a.byte_start = span.byte_start AND a.byte_end = span.byte_end`** — find pairs of features that cover the exact same byte range (the `<span>` wrapper and the `<a>` link share the same range because the anchor fills the span)
3. **`WHERE span.name = 'span' AND class_contains(span.data, 'h-card')`** — the outer element must be a `<span class="h-card">` (Mastodon's microformat for user cards)
4. **`AND a.name = 'a' AND class_contains(a.data, 'u-url')`** — the inner element must be an `<a class="u-url mention">` (the actual mention link)
5. **`json_object('href', json_get(a.data, 'href'), 'handle', ltrim(...))`** — build the output feature's attributes: extract the `href` from the link, and derive the `handle` by stripping the leading `@` from the visible text
6. **`INSERT INTO features`** — create a new `org.joinmastodon.facet#mention` feature with these combined attributes
7. **The two `DELETE` statements** — remove the original `span` and `a` features since they've been collapsed into the single `mention` feature

The result has a single `org.joinmastodon.facet#mention` feature with `href` and `handle` attributes, replacing the two-element HTML structure.

## Class-Based Feature Mapping

Map `<span class="highlight">` to a custom `highlight` mark:

```ts
const result = applyFacetSQL(doc, `
  INSERT INTO features (byte_start, byte_end, type_id, name, data)
  SELECT byte_start, byte_end, 'com.example.facet', 'highlight', '{}'
  FROM features
  WHERE name = 'span' AND class_contains(data, 'highlight');

  DELETE FROM features
  WHERE name = 'span' AND class_contains(data, 'highlight');
`)
```

**How this works:**

1. **`SELECT ... FROM features WHERE name = 'span' AND class_contains(data, 'highlight')`** — find all `<span>` elements with CSS class `highlight`
2. **`INSERT INTO features ... 'com.example.facet', 'highlight', '{}'`** — create a new feature in a custom namespace for each match, with no attributes
3. **`DELETE FROM features WHERE ...`** — remove the original HTML spans so the document has clean semantic features instead of presentation markup

## Renaming a Namespace

Migrate all features from one namespace to another:

```ts
const result = applyFacetSQL(doc, `
  UPDATE features
  SET type_id = replace(type_id, 'org.w3c.html.facet', 'com.example.html.facet')
  WHERE type_id LIKE 'org.w3c.html.facet%'
`)
```

This uses SQL's `replace()` function to rewrite the `type_id` string for all matching features in one statement.

## Text-Derived Attributes

Extract the displayed text as an attribute (e.g., for mention normalization):

```ts
const result = applyFacetSQL(doc, `
  UPDATE features
  SET data = json_object(
    'handle', ltrim(text_at(byte_start, byte_end), '@'),
    'href',   json_get(data, 'href')
  )
  WHERE name = 'mention'
`)
```

This rebuilds the feature's `data` JSON from scratch: it keeps the existing `href` and adds a `handle` derived from the document text (with the leading `@` stripped via `ltrim`).

## Splitting a Feature by Attribute

Convert headings stored as a single `heading` feature with a `level` attribute into
`h1`/`h2`/... features using `CASE`:

```sql
UPDATE features
SET name = CASE json_get(data, 'level')
             WHEN '1' THEN 'h1'
             WHEN '2' THEN 'h2'
             WHEN '3' THEN 'h3'
             WHEN '4' THEN 'h4'
             WHEN '5' THEN 'h5'
             WHEN '6' THEN 'h6'
             ELSE 'h1'
           END,
    data = json_object()
WHERE name = 'heading'
```

**How this works:**

1. **`WHERE name = 'heading'`** — target all heading features (which store their level in an attribute rather than their name)
2. **`CASE json_get(data, 'level')`** — read the `level` attribute from each heading's data JSON
3. **`WHEN '1' THEN 'h1'`** — map each level value to the corresponding HTML-style name
4. **`data = json_object()`** — replace the data with an empty object since the level information is now encoded in the feature name

## Dropping Unknown Features

Remove all features from a namespace that are not in an allowlist:

```sql
DELETE FROM features
WHERE type_id = 'org.w3c.html.facet'
  AND name NOT IN ('strong', 'em', 'code', 'a', 'p', 'h1', 'h2', 'h3')
```

Any feature whose `name` is not in the allowlist is deleted. This is useful for sanitizing documents to a known-safe subset of formatting.

## Reading Feature Data

Query features to inspect a document's structure:

```ts
import { from, Document } from 'relational-text'
import { applyFacetSQL } from 'relational-text/sql'

// applyFacetSQL returns a Document — use toJSON() to inspect
const doc = from('markdown', '## Hello\n\nParagraph with **bold**.')
const result = applyFacetSQL(doc, `
  SELECT byte_start, byte_end, type_id, name, data FROM features
`)
// The result document has the same features — use doc.toJSON().facets to inspect
console.log(doc.toJSON().facets)
```

::: tip
`applyFacetSQL` always returns a `Document`. To read query results, inspect the returned document's `facets` array via `doc.toJSON().facets`. `SELECT` statements that don't modify the table return the document unchanged.
:::
