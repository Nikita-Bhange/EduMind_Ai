import dotenv from 'dotenv';
import fs from 'fs/promises';
import { GoogleGenAI, createPartFromBase64, createPartFromUri } from '@google/genai';

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY is not set in the environment variables.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── Model config ────────────────────────────────────────────────────────────
// gemini-2.5-flash  → fast + accurate (recommended)
// gemini-2.5-pro    → best accuracy, slower, higher cost
const MODEL = 'gemini-2.5-flash';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalizeSource = (source) => {
  if (typeof source === 'string') {
    return { text: source, pdfPart: null };
  }
  return {
    text: source?.text || '',
    pdfPart: source?.pdfPart || null,
  };
};

const buildContents = (prompt, source, textLimit = 40000) => {
  const { text, pdfPart } = normalizeSource(source);
  const contents = [prompt];

  if (pdfPart) {
    contents.push(pdfPart);
  }

  if (text.trim()) {
    contents.push(
      `Supplemental extracted text from the same document:\n${text.substring(0, textLimit)}`
    );
  }

  return contents;
};

const stripCodeFence = (text = '') =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

const parseJsonArray = (text = '') => {
  const stripped = stripCodeFence(text);
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const normalizeDifficulty = (difficulty = 'medium') => {
  const value = String(difficulty).toLowerCase();
  return ['easy', 'medium', 'hard'].includes(value) ? value : 'medium';
};

// ─── PDF upload ───────────────────────────────────────────────────────────────

export const uploadPdfAndCreatePart = async (filePath, displayName = 'document.pdf') => {
  try {
    const uploadedFile = await ai.files.upload({
      file: filePath,
      config: {
        mimeType: 'application/pdf',
        displayName,
      },
    });

    return {
      file: uploadedFile,
      part: createPartFromUri(uploadedFile.uri, uploadedFile.mimeType || 'application/pdf'),
    };
  } catch (error) {
    const detail = error?.message || error?.statusText || 'Unknown Gemini upload error';
    console.error('Gemini file upload error:', detail, error);
    const uploadError = new Error(`Failed to upload PDF to Gemini: ${detail}`);

    if (detail.includes('PERMISSION_DENIED') || detail.toLowerCase().includes('api key')) {
      uploadError.statusCode = 502;
      uploadError.message =
        'Gemini API key is invalid or expired. Please update your GEMINI_API_KEY in .env.';
    }

    throw uploadError;
  }
};

export const createPartFromStoredUri = (uri, mimeType = 'application/pdf') =>
  createPartFromUri(uri, mimeType);

export const createPartFromLocalPdf = async (filePath) => {
  const fileBuffer = await fs.readFile(filePath);
  return createPartFromBase64(fileBuffer.toString('base64'), 'application/pdf');
};

// ─── Flashcards ───────────────────────────────────────────────────────────────

export const generateFlashcards = async (source, count = 10) => {
  const prompt = `You are an expert academic tutor specializing in medicine, biology, biochemistry, and anatomy.

Your task is to generate exactly ${count} high-quality flashcards based STRICTLY on the content of the attached document.

STRICT RULES:
- Use ONLY information from the document. Do NOT use outside knowledge.
- Ignore cover pages, file names, authors, page numbers, metadata, and table of contents.
- Focus on the actual body content: definitions, mechanisms, pathways, structures, functions, relationships, and clinical correlations.
- Each flashcard must test a DIFFERENT concept — do not repeat similar ideas.
- Questions must be specific and unambiguous. Avoid vague or trivial questions.
- Answers must be accurate, concise (1–3 sentences), and directly supported by the document.
- Cover all major sections of the document proportionally.

QUESTION TYPES to include (mix these):
- Mechanism/pathway questions ("What is the role of X in Y pathway?")
- Structure-function questions ("What is the function of X?")
- Comparison questions ("How does X differ from Y?")
- Cause-effect questions ("What happens when X is deficient?")
- Clinical correlation questions if applicable

DIFFICULTY DISTRIBUTION:
- 30% easy (basic recall)
- 50% medium (application/relationship)
- 20% hard (multi-step reasoning/comparison)

If the document does not contain enough readable content to generate flashcards, return exactly: INSUFFICIENT_CONTENT

Return ONLY a valid JSON array, no markdown, no explanation:
[
  {"question": "Clear specific question", "answer": "Concise accurate answer", "difficulty": "medium"}
]`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildContents(prompt, source, 40000),
    });

    const generatedText = response.text || '';

    if (generatedText.includes('INSUFFICIENT_CONTENT')) {
      return [];
    }

    const parsedCards = parseJsonArray(generatedText);
    const flashcards = Array.isArray(parsedCards)
      ? parsedCards
          .map((card) => ({
            question: String(card.question || '').trim(),
            answer: String(card.answer || '').trim(),
            difficulty: normalizeDifficulty(card.difficulty),
          }))
          .filter((card) => card.question && card.answer)
      : [];

    return flashcards.slice(0, count);
  } catch (error) {
    console.error('Gemini flashcard error:', error);
    throw new Error('Failed to generate flashcards');
  }
};

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export const generateQuiz = async (source, numQuestions = 5) => {
  const prompt = `You are an expert academic examiner specializing in medicine, biology, biochemistry, and anatomy.

Your task is to generate exactly ${numQuestions} multiple-choice questions (MCQs) based STRICTLY on the attached document.

STRICT RULES:
- Use ONLY information from the document. Do NOT use outside knowledge.
- Ignore cover pages, file names, authors, page numbers, metadata, and table of contents.
- Each question must test a DIFFERENT concept — no duplicates.
- All 4 options must be plausible. Avoid obviously wrong distractors.
- The correct answer must be EXACTLY one of the 4 options (copy it word-for-word).
- Explanation must cite the reasoning from the document content.
- Cover all major sections of the document proportionally.

QUESTION TYPES to include (mix these):
- Application questions ("A patient presents with X deficiency. What is affected?")
- Mechanism questions ("Which enzyme catalyzes X?")
- Comparison questions ("Which of the following correctly distinguishes X from Y?")
- Structure-function questions
- Cause-effect / clinical correlation questions

DIFFICULTY: Mostly medium. Avoid trivial true/false style questions.

If the document does not contain enough readable content, return exactly: INSUFFICIENT_CONTENT

Return ONLY a valid JSON array, no markdown, no explanation:
[
  {
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Exact text of correct option",
    "explanation": "Brief explanation grounded in the document",
    "difficulty": "medium"
  }
]`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildContents(prompt, source, 40000),
    });

    const generatedText = response.text || '';

    if (generatedText.includes('INSUFFICIENT_CONTENT')) {
      return [];
    }

    const parsedQuestions = parseJsonArray(generatedText);
    const questions = Array.isArray(parsedQuestions)
      ? parsedQuestions
          .map((item) => {
            const options = Array.isArray(item.options)
              ? item.options.map((o) => String(o || '').trim()).filter(Boolean).slice(0, 4)
              : [];

            let correctAnswer = String(item.correctAnswer || '').trim();

            // Handle if model returns index like "O1" instead of actual text
            const optionIndexMatch = correctAnswer.match(/^O([1-4])$/i);
            if (optionIndexMatch) {
              correctAnswer = options[Number(optionIndexMatch[1]) - 1] || correctAnswer;
            }

            // Auto-fix: if correctAnswer isn't in options, pick closest match
            if (options.length && !options.includes(correctAnswer)) {
              const lower = correctAnswer.toLowerCase();
              const match = options.find((o) => o.toLowerCase().includes(lower) || lower.includes(o.toLowerCase()));
              if (match) correctAnswer = match;
            }

            return {
              question: String(item.question || '').trim(),
              options,
              correctAnswer,
              explanation: String(item.explanation || '').trim(),
              difficulty: normalizeDifficulty(item.difficulty),
            };
          })
          .filter((item) => item.question && item.options.length === 4 && item.correctAnswer)
      : [];

    return questions.slice(0, numQuestions);
  } catch (error) {
    const detail = error?.message || 'Unknown Gemini quiz error';
    console.error('Gemini quiz error:', detail, error);
    const quizError = new Error(`Failed to generate quiz: ${detail}`);
    quizError.statusCode = error?.statusCode || error?.status || 500;
    throw quizError;
  }
};

// ─── Summary ──────────────────────────────────────────────────────────────────

export const generateSummary = async (source) => {
  const prompt = `You are an expert academic summarizer.

Summarize the attached document clearly and accurately based ONLY on its content.
Do not use outside knowledge. If the document is unreadable or lacks meaningful content, say so plainly.

Structure your response exactly as follows:

## Main Topic
State what the document is about in 2–3 sentences.

## Key Concepts
List the most important concepts, terms, or ideas covered.

## Detailed Summary
Summarize each major section or topic in the document. Include mechanisms, pathways, structures, and functions where relevant.

## Important Details & Examples
Highlight any specific facts, values, clinical examples, or case studies mentioned.

## Quick Revision Points
Bullet list of the 5–10 most important takeaways for exam preparation.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildContents(prompt, source, 40000),
    });

    return response.text;
  } catch (error) {
    console.error('Gemini summary error:', error);
    throw new Error('Failed to generate summary');
  }
};

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const chatWithContext = async (question, chunks, source = null) => {
  const context = chunks.map((c, i) => `Chunk ${i + 1}:\n${c.content}`).join('\n\n');

  const prompt = `You are an expert academic tutor. Answer the user's question using ONLY the attached document and the provided context below.

If the answer is not found in the document, clearly say: "This information is not covered in the document."
Do not use outside knowledge. Be specific and cite relevant parts of the document where possible.

--- Document Context ---
${context}
--- End Context ---

Question: ${question}

Answer:`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildContents(prompt, source, 30000),
    });

    return response.text;
  } catch (error) {
    console.error('Gemini chat error:', error);
    throw new Error('Failed to process chat request');
  }
};

// ─── Explain Concept ──────────────────────────────────────────────────────────

export const explainConcept = async (concept, context, source = null) => {
  const prompt = `You are an expert academic tutor.

Explain the concept of "${concept}" using ONLY the attached document and the context provided below.
Do not use outside knowledge.

Structure your explanation as:
1. **Definition** - What is ${concept}?
2. **Key Details** - Mechanisms, components, or steps involved
3. **Function/Significance** - Why it matters
4. **Example** - A specific example from the document if available

--- Context ---
${context.substring(0, 15000)}
--- End Context ---`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildContents(prompt, source, 15000),
    });

    return response.text;
  } catch (error) {
    console.error('Gemini explain error:', error);
    throw new Error('Failed to explain concept');
  }
};

// import dotenv from 'dotenv';
// import fs from 'fs/promises';
// import { GoogleGenAI, createPartFromBase64, createPartFromUri } from '@google/genai';

// dotenv.config();

// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// if (!process.env.GEMINI_API_KEY) {
//   console.error('FATAL ERROR: GEMINI_API_KEY is not set in the environment variables.');
//   process.exit(1);
// }

// const normalizeSource = (source) => {
//   if (typeof source === 'string') {
//     return { text: source, pdfPart: null };
//   }

//   return {
//     text: source?.text || '',
//     pdfPart: source?.pdfPart || null,
//   };
// };

// const buildContents = (prompt, source, textLimit = 15000) => {
//   const { text, pdfPart } = normalizeSource(source);
//   const contents = [prompt];

//   if (pdfPart) {
//     contents.push(pdfPart);
//   }

//   if (text.trim()) {
//     contents.push(`Supplemental extracted text from the same PDF:\n${text.substring(0, textLimit)}`);
//   }

//   return contents;
// };

// const stripCodeFence = (text = '') =>
//   text
//     .trim()
//     .replace(/^```(?:json)?\s*/i, '')
//     .replace(/```$/i, '')
//     .trim();

// const parseJsonArray = (text = '') => {
//   const stripped = stripCodeFence(text);
//   try {
//     return JSON.parse(stripped);
//   } catch {
//     const match = stripped.match(/\[[\s\S]*\]/);
//     if (!match) return null;
//     try {
//       return JSON.parse(match[0]);
//     } catch {
//       return null;
//     }
//   }
// };

// const normalizeDifficulty = (difficulty = 'medium') => {
//   const value = String(difficulty).toLowerCase();
//   return ['easy', 'medium', 'hard'].includes(value) ? value : 'medium';
// };

// export const uploadPdfAndCreatePart = async (filePath, displayName = 'document.pdf') => {
//   try {
//     const uploadedFile = await ai.files.upload({
//       file: filePath,
//       config: {
//         mimeType: 'application/pdf',
//         displayName,
//       },
//     });

//     return {
//       file: uploadedFile,
//       part: createPartFromUri(uploadedFile.uri, uploadedFile.mimeType || 'application/pdf'),
//     };
//   } catch (error) {
//     const detail = error?.message || error?.statusText || 'Unknown Gemini upload error';
//     console.error('Gemini file upload error:', detail, error);
//     const uploadError = new Error(`Failed to upload PDF to Gemini: ${detail}`);

//     if (
//       detail.includes('PERMISSION_DENIED') ||
//       detail.toLowerCase().includes('api key')
//     ) {
//       uploadError.statusCode = 502;
//       uploadError.message = 'Gemini API key is invalid, expired, or not permitted. Please create a new Gemini API key and update Backend/.env.';
//     }

//     throw uploadError;
//   }
// };

// export const createPartFromStoredUri = (uri, mimeType = 'application/pdf') =>
//   createPartFromUri(uri, mimeType);

// export const createPartFromLocalPdf = async (filePath) => {
//   const fileBuffer = await fs.readFile(filePath);
//   return createPartFromBase64(fileBuffer.toString('base64'), 'application/pdf');
// };

// /**
//  * Generate flashcards from text
//  * @param {string} text - Document text
//  * @param {number} count - Number of flashcards to generate
//  * @returns {Promise<Array<{question: string, answer: string, difficulty: string}>>}
//  */
// export const generateFlashcards = async (source, count = 10) => {
//   const candidateCount = Math.min(20, Math.max(count + 4, count));
//   const prompt = `Generate ${candidateCount} high-quality educational flashcards strictly from the attached document, then return the best ${count}.
// Do not use outside knowledge. Ignore file names, authors, creation dates, cover pages, page labels, and PDF metadata.
// Prioritize medically/academically important ideas from the body content.
// Cover distinct sections and topics across the document. If anatomy, biochemistry, and physiology are present, include all of them.
// Avoid trivial questions like who created the PDF, what the title is, or how many pages it has.
// Prefer moderate recall, comparison, relationship, function, and application questions.
// If the document does not contain enough readable content, return exactly:
// INSUFFICIENT_CONTENT

// Return only valid JSON, no markdown:
// [
//   {"question":"Clear specific question","answer":"Concise accurate answer","difficulty":"medium"}
// ]
// `;

//   try {
//     const response = await ai.models.generateContent({
//       model: 'gemini-2.5-flash-lite',
//       contents: buildContents(prompt, source),
//     });

//     const generatedText = response.text || '';

//     if (generatedText.includes('INSUFFICIENT_CONTENT')) {
//       return [];
//     }

//     const parsedCards = parseJsonArray(generatedText);
//     const flashcards = Array.isArray(parsedCards)
//       ? parsedCards
//           .map((card) => ({
//             question: String(card.question || '').trim(),
//             answer: String(card.answer || '').trim(),
//             difficulty: normalizeDifficulty(card.difficulty),
//           }))
//           .filter((card) => card.question && card.answer)
//       : [];

//     return flashcards.slice(0, count);
//   } catch (error) {
//     console.error('Gemini API error:', error);
//     throw new Error('Failed to generate flashcards');
//   }
// };

// /**
//  * Generate quiz questions
//  * @param {string} text - Document text
//  * @param {number} numQuestions - Number of questions
//  * @returns {Promise<Array<{question: string, options: Array, correctAnswer: string, explanation: string, difficulty: string}>>}
//  */
// export const generateQuiz = async (source, numQuestions = 5) => {
//   const candidateCount = Math.min(15, Math.max(numQuestions + 3, numQuestions));
//   const prompt = `Generate ${candidateCount} multiple choice question candidates strictly from the attached document, then return the best ${numQuestions}.
// Do not use outside knowledge. Ignore file names, authors, creation dates, cover pages, page labels, and PDF metadata.
// Cover distinct sections and topics across the document. If anatomy, biochemistry, and physiology are present, include questions from all sections.
// Target mostly medium difficulty. Avoid very easy definition-only questions unless needed for balance.
// Prefer application, comparison, cause-effect, structure-function, and clinical/academic reasoning questions.
// Each question must test actual body content from the document, not document properties.
// If the document does not contain enough readable content, return exactly:
// INSUFFICIENT_CONTENT

// Return only valid JSON, no markdown:
// [
//   {
//     "question":"Question text",
//     "options":["Option A","Option B","Option C","Option D"],
//     "correctAnswer":"Exact option text",
//     "explanation":"Brief explanation grounded in the document",
//     "difficulty":"medium"
//   }
// ]
// `;

//   try {
//     const response = await ai.models.generateContent({
//       model: 'gemini-2.5-flash-lite',
//       contents: buildContents(prompt, source),
//     });

//     const generatedText = response.text || '';

//     if (generatedText.includes('INSUFFICIENT_CONTENT')) {
//       return [];
//     }

//     const parsedQuestions = parseJsonArray(generatedText);
//     const questions = Array.isArray(parsedQuestions)
//       ? parsedQuestions
//           .map((item) => {
//             const options = Array.isArray(item.options)
//               ? item.options.map((option) => String(option || '').trim()).filter(Boolean).slice(0, 4)
//               : [];
//             let correctAnswer = String(item.correctAnswer || '').trim();
//             const optionIndexMatch = correctAnswer.match(/^O([1-4])$/i);
//             if (optionIndexMatch) {
//               correctAnswer = options[Number(optionIndexMatch[1]) - 1] || correctAnswer;
//             }

//             return {
//               question: String(item.question || '').trim(),
//               options,
//               correctAnswer,
//               explanation: String(item.explanation || '').trim(),
//               difficulty: normalizeDifficulty(item.difficulty),
//             };
//           })
//           .filter((item) => item.question && item.options.length === 4 && item.correctAnswer)
//       : [];

//     return questions.slice(0, numQuestions);
//   } catch (error) {
//     const detail = error?.message || 'Unknown Gemini quiz error';
//     console.error('Gemini quiz error:', detail, error);
//     const quizError = new Error(`Failed to generate quiz: ${detail}`);
//     quizError.statusCode = error?.statusCode || error?.status || 500;
//     throw quizError;
//   }
// };


// /**
//  * Generate document summary
//  * @param {string} text - Document text
//  * @returns {Promise<string>}
//  */
// export const generateSummary = async (source) => {
//   const prompt = `Summarize the attached document clearly and accurately.
// Focus only on the document content.
// If the document is unreadable or does not contain enough meaningful content, say that plainly.

// Structure the response as:
// 1. Main topic
// 2. Key points
// 3. Important details or examples`;

//   try {
//     const response = await ai.models.generateContent({
//       model: "gemini-2.5-flash-lite",
//       contents: buildContents(prompt, source, 20000),
//     });

//     const generatedText = response.text;
//     return generatedText;
//   } catch (error) {
//     console.error('Gemini API error:', error);
//     throw new Error('Failed to generate summary');
//   }
// };


// /**
//  * Chat with document context
//  * @param {string} question - User question
//  * @param {Array<Object>} chunks - Relevant document chunks
//  * @returns {Promise<string>}
//  */
// export const chatWithContext = async (question, chunks, source = null) => {
//   const context = chunks
//     .map((c, i) => `Chunk ${i + 1}:\n${c.content}`)
//     .join("\n\n");

//   const prompt = `Answer the user's question using only the attached document and any provided extracted context.
// If the answer is not supported by the document, say so clearly.

// Context:
// ${context}

// Question: ${question}

// Answer:`;

//   try {
//     const response = await ai.models.generateContent({
//       model: "gemini-2.5-flash-lite",
//       contents: buildContents(prompt, source, 12000),
//     });

//     const generatedText = response.text;
//     return generatedText;
//   } catch (error) {
//     console.error('Gemini API error:', error);
//     throw new Error('Failed to process chat request');
//   }
// };
// /**
//  * Explain a specific concept
//  * @param {string} concept - Concept to explain
//  * @param {string} context - Relevant context
//  * @returns {Promise<string>}
//  */
// export const explainConcept = async (concept, context, source = null) => {
//   const prompt = `Explain the concept of "${concept}" using only the attached document and the provided context.
// Provide a clear, educational explanation that's easy to understand.
// Include examples if relevant.

// Context:
// ${context.substring(0, 10000)}`;

//   try {
//     const response = await ai.models.generateContent({
//       model: 'gemini-2.5-flash-lite',
//       contents: buildContents(prompt, source, 10000),
//     });

//     const generatedText = response.text;
//     return generatedText;
//   } catch (error) {
//     console.error('Gemini API error:', error);
//     throw new Error('Failed to explain concept');
//   }
// };
