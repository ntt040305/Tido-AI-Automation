"""
TIDO Voice Performance Engine - Breath-Aware Semantic Chunker
============================================================
Combines speech phrases into optimal F5 Inference Chunks.
Enforces MIN_CHUNK_GUARD and SHORT_CHUNK_MERGER to prevent accidental
tiny chunks while respecting intentional isolated short answers.
"""

from dataclasses import dataclass
from typing import List
from tido_engine.semantic_phrase_planner import SpeechPhrase

MIN_WORDS_TARGET = 4
MAX_WORDS_TARGET = 22

@dataclass
class InferenceChunk:
    chunk_index: int
    text: str
    word_count: int
    boundary_after: str  # ',', '.', '?', '!', ';', or ''
    pause_after_ms: int = 250
    is_question: bool = False
    is_exclamation: bool = False

class BreathAwareChunker:
    def __init__(self, min_words: int = MIN_WORDS_TARGET, max_words: int = MAX_WORDS_TARGET):
        self.min_words = min_words
        self.max_words = max_words

    def create_chunks(self, phrases: List[SpeechPhrase]) -> List[InferenceChunk]:
        if not phrases:
            return []

        chunks: List[InferenceChunk] = []
        buf_text = ""
        buf_words = 0
        buf_boundary = ""
        is_q = False
        is_ex = False

        for i, phrase in enumerate(phrases):
            p_text = phrase.text.strip()
            p_words = phrase.word_count
            p_bound = phrase.boundary_after

            # Check if this phrase is an intentional short sentence (e.g. "Không.", "Đúng vậy.")
            is_terminal = p_bound in ['.', '?', '!']
            
            if not buf_text:
                buf_text = p_text
                buf_words = p_words
                buf_boundary = p_bound
                is_q = phrase.is_question
                is_ex = phrase.is_exclamation
            else:
                # Decide whether to merge or commit
                combined_words = buf_words + p_words
                
                # Merge if under max_words limit and previous boundary wasn't strong terminal
                if combined_words <= self.max_words and buf_boundary not in ['.', '?', '!']:
                    separator = ", " if buf_boundary == "," else " "
                    buf_text += separator + p_text
                    buf_words = combined_words
                    buf_boundary = p_bound
                    is_q = is_q or phrase.is_question
                    is_ex = is_ex or phrase.is_exclamation
                else:
                    # Commit current buffer as chunk
                    chunks.append(self._build_chunk(len(chunks), buf_text, buf_words, buf_boundary, is_q, is_ex))
                    buf_text = p_text
                    buf_words = p_words
                    buf_boundary = p_bound
                    is_q = phrase.is_question
                    is_ex = phrase.is_exclamation

        if buf_text:
            chunks.append(self._build_chunk(len(chunks), buf_text, buf_words, buf_boundary, is_q, is_ex))

        # Pass 2: SHORT_CHUNK_MERGER (Merge tiny orphan chunk at end if possible)
        if len(chunks) > 1 and chunks[-1].word_count < 3:
            prev = chunks[-2]
            last = chunks[-1]
            if prev.word_count + last.word_count <= self.max_words:
                prev.text += " " + last.text
                prev.word_count += last.word_count
                prev.boundary_after = last.boundary_after
                prev.is_question = prev.is_question or last.is_question
                prev.is_exclamation = prev.is_exclamation or last.is_exclamation
                chunks.pop()

        return chunks

    def _build_chunk(self, idx: int, text: str, word_cnt: int, bound: str, is_q: bool, is_ex: bool) -> InferenceChunk:
        # Determine base pause after chunk in ms
        pause_ms = 250
        if bound == ',':
            pause_ms = 180
        elif bound in ['.', ';']:
            pause_ms = 350
        elif bound in ['?', '!']:
            pause_ms = 400
            
        return InferenceChunk(
            chunk_index=idx,
            text=text,
            word_count=word_cnt,
            boundary_after=bound,
            pause_after_ms=pause_ms,
            is_question=is_q,
            is_exclamation=is_ex
        )
