// embeddings.js
import { pipeline } from '@xenova/transformers';

// Load the free embedding model (runs locally)
const getEmbeddings = async (textArray) => {
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  
  const embeddings = [];
  for (const text of textArray) {
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    embeddings.push(output.data); // Embedding vector
  }

  return embeddings;
};

export default getEmbeddings;
