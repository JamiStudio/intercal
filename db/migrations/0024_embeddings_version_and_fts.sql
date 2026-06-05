-- 0024_embeddings_version_and_fts.sql
-- W5: Add embedding_version column to all embedding tables (model + dim + version
-- together fully identify the vector space for re-embedding detection), and add
-- a full-text search index on document_chunks.chunk_text for hybrid retrieval.
--
-- embedding_version: a short string (e.g. 'v1', 'onnx-1.18.0') identifying the
-- specific build/version of the embedding runtime used.  Combined with model + dim
-- it unambiguously identifies when a re-embed is needed (different runtime can
-- produce slightly different vectors from the same model weights).
--
-- Hybrid retrieval: the chunk FTS index (GIN on to_tsvector) powers the lexical
-- leg of the W5 hybrid search function (BM25-approximated + cosine-similarity
-- merged by Reciprocal Rank Fusion).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; CREATE INDEX IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- embedding_version column on chunk_embeddings
-- ---------------------------------------------------------------------------
ALTER TABLE chunk_embeddings
    ADD COLUMN IF NOT EXISTS embedding_version text NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN chunk_embeddings.embedding_version IS
    'Runtime/build version of the embedding model (e.g. "onnx-1.18.0", "v1"). '
    'Stored alongside model + dim to detect when re-embedding is warranted. '
    'Set to "unknown" for rows created before W5 backfills the value.';

-- ---------------------------------------------------------------------------
-- embedding_version column on document_embeddings
-- ---------------------------------------------------------------------------
ALTER TABLE document_embeddings
    ADD COLUMN IF NOT EXISTS embedding_version text NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN document_embeddings.embedding_version IS
    'Runtime/build version of the embedding model. Same semantics as chunk_embeddings.';

-- ---------------------------------------------------------------------------
-- embedding_version column on claim_embeddings
-- ---------------------------------------------------------------------------
ALTER TABLE claim_embeddings
    ADD COLUMN IF NOT EXISTS embedding_version text NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN claim_embeddings.embedding_version IS
    'Runtime/build version of the embedding model. Same semantics as chunk_embeddings.';

-- ---------------------------------------------------------------------------
-- Full-text search index on document_chunks.chunk_text (lexical retrieval leg)
-- ---------------------------------------------------------------------------
-- The 'english' config handles stemming + stop-words for the default W1 seed
-- (Wikidata/GitHub English content).  Arabic chunks return fewer but valid stems
-- under 'english'; for production multi-lingual coverage, upgrade to a
-- per-document stored tsvector column with language routing (Plan 03).
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts
    ON document_chunks USING gin(to_tsvector('english', chunk_text));

COMMENT ON INDEX idx_document_chunks_fts IS
    'GIN full-text index for lexical (keyword) retrieval leg of W5 hybrid search. '
    'Uses simple English stemming config suitable for the W1 seed corpus. '
    'Per-language routing is a Plan 03 enhancement.';
