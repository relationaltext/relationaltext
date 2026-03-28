/**
 * Recipe Appview API client.
 *
 * The appview at API_BASE provides recipe listings, search, and metadata.
 * The PDS at PDS_BASE is the source of truth for recipe documents (text + facets).
 * fetchRecipe combines both: appview for metadata/ingredients, PDS for the document.
 */

const API_BASE = process.env.NEXT_PUBLIC_APPVIEW_URL || 'http://localhost:3001'
const PDS_BASE = process.env.NEXT_PUBLIC_PDS_URL || 'http://localhost:2590'

export interface RecipeListItem {
  uri: string
  did: string
  rkey: string
  title: string
  servings: number | null
  prepTime: string | null
  cookTime: string | null
  sourceUrl: string | null
  indexedAt: string
}

export interface RecipeIngredient {
  recipeUri: string
  ingredientUri: string
  amount: number | null
  unit: string | null
  prep: string | null
  vocabularyName: string | null
}

export interface RecipeDetail extends RecipeListItem {
  document: any  // RelationalText Document JSON ({text, facets})
  ingredients: RecipeIngredient[]
}

export interface VocabularyItem {
  uri: string
  type: string
  name: string
  aliases: string | null
  category: string | null
  description: string | null
  fdc_id: number | null
}

export async function fetchRecipes(opts?: { limit?: number; offset?: number; tag?: string }): Promise<RecipeListItem[]> {
  const params = new URLSearchParams()
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.offset) params.set('offset', String(opts.offset))
  if (opts?.tag) params.set('tag', opts.tag)
  const res = await fetch(`${API_BASE}/recipes?${params}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  return data.recipes
}

export async function fetchRecipe(rkey: string): Promise<RecipeDetail> {
  // Get metadata + ingredients from appview
  const res = await fetch(`${API_BASE}/recipes/${encodeURIComponent(rkey)}`)
  if (!res.ok) throw new Error(`Recipe not found: ${rkey}`)
  const appviewData = await res.json()

  // Fetch the full record (with document) from the PDS
  const pdsParams = new URLSearchParams({
    repo: appviewData.did,
    collection: 'org.pannacotta.recipe',
    rkey,
  })
  const pdsRes = await fetch(`${PDS_BASE}/xrpc/com.atproto.repo.getRecord?${pdsParams}`)
  if (!pdsRes.ok) throw new Error(`PDS record not found: ${rkey}`)
  const pdsData = await pdsRes.json()

  return {
    ...appviewData,
    document: pdsData.value.document,
  }
}

export async function searchRecipes(query: string, limit = 50): Promise<RecipeListItem[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const res = await fetch(`${API_BASE}/search?${params}`)
  if (!res.ok) throw new Error(`Search error: ${res.status}`)
  const data = await res.json()
  return data.recipes
}

export async function fetchIngredientRecipes(rkey: string, limit = 50): Promise<RecipeListItem[]> {
  const res = await fetch(`${API_BASE}/ingredients/${encodeURIComponent(rkey)}/recipes?limit=${limit}`)
  if (!res.ok) throw new Error(`Ingredient recipes error: ${res.status}`)
  const data = await res.json()
  return data.recipes
}

export async function fetchVocabulary(type: 'ingredients' | 'equipment' | 'techniques', limit = 50): Promise<VocabularyItem[]> {
  const res = await fetch(`${API_BASE}/${type}?limit=${limit}`)
  if (!res.ok) throw new Error(`Vocabulary error: ${res.status}`)
  const data = await res.json()
  return data.items
}
