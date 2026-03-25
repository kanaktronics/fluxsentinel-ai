/**
 * tools/vectorStore.js
 * Vectra LocalIndex wrapper for RAG context storage.
 * Persists to ./data/vector-store directory.
 * Functions: initStore, addDocument, queryDocuments.
 */

import { LocalIndex } from 'vectra';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEmbedding } from './claudeClient.js';
import logger from '../middleware/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '../../data/vector-store');

let _index = null;

/**
 * Initialize the vector store. Creates directory if needed.
 * Safe to call multiple times — idempotent.
 */
export async function initStore() {
  if (_index) return _index;

  _index = new LocalIndex(STORE_PATH);

  if (!(await _index.isIndexCreated())) {
    await _index.createIndex();
    logger.info('Vector store: Created new index at ' + STORE_PATH);
  } else {
    logger.info('Vector store: Loaded existing index from ' + STORE_PATH);
  }

  return _index;
}

/**
 * Add a text document to the vector store.
 * @param {string} text - The content to embed and store
 * @param {object} metadata - Arbitrary metadata (type, source, mrIid, etc.)
 */
export async function addDocument(text, metadata = {}) {
  const index = await initStore();

  if (!text || text.trim().length === 0) {
    logger.warn('Vector store: Skipping empty document');
    return;
  }

  // Truncate very long texts to avoid embedding issues
  const truncated = text.slice(0, 8000);

  try {
    const vector = await getEmbedding(truncated);
    await index.insertItem({
      vector,
      metadata: {
        ...metadata,
        text: truncated,
        addedAt: new Date().toISOString(),
      },
    });
    logger.debug(`Vector store: Added document (type=${metadata.type || 'unknown'}, chars=${truncated.length})`);
  } catch (err) {
    logger.error(`Vector store: Failed to add document: ${err.message}`);
  }
}

/**
 * Query the vector store for the most relevant documents.
 * @param {string} queryText - The query to embed and search
 * @param {number} topK - Number of results to return
 * @returns {Array} Array of { text, metadata, score } objects
 */
export async function queryDocuments(queryText, topK = 5) {
  if (!queryText || queryText.trim().length === 0) return [];

  try {
    const index = await initStore();
    const vector = await getEmbedding(queryText);
    const results = await index.queryItems(vector, topK);
    return results.map(r => ({
      text: r.item.metadata?.text || '',
      metadata: r.item.metadata || {},
      score: r.score,
    }));
  } catch (err) {
    logger.error(`Vector store: Query failed: ${err.message}`);

    // Auto-heal: corrupted index file — delete and rebuild
    try {
      logger.warn('Vector store: Detected corruption, rebuilding index...');
      if (_index) {
        await _index.deleteIndex().catch(() => {});
      }
      _index = null; // force re-init on next call
      await initStore();
      logger.info('Vector store: Rebuilt successfully — next run will embed fresh context');
    } catch (rebuildErr) {
      logger.error(`Vector store: Rebuild failed: ${rebuildErr.message}`);
      _index = null;
    }
    return [];
  }
}

/**
 * Clear all documents from the store (useful for testing).
 */
export async function clearStore() {
  const index = await initStore();
  try {
    await index.deleteIndex();
    _index = null;
    await initStore();
    logger.info('Vector store: Cleared and re-initialized');
  } catch (err) {
    logger.error(`Vector store: Clear failed: ${err.message}`);
  }
}
