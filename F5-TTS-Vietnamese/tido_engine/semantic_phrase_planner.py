"""
TIDO Voice Performance Engine - Semantic Phrase Planner
======================================================
Parses Vietnamese sentences into natural human speech phrases based on syntax,
punctuation, clause boundaries, and semantic relationships.
"""

import re
from dataclasses import dataclass
from typing import List

@dataclass
class SpeechPhrase:
    text: str
    phrase_index: int
    boundary_after: str  # ',', '.', '?', '!', ';', or ''
    word_count: int
    is_question: bool = False
    is_exclamation: bool = False

class SemanticPhrasePlanner:
    def __init__(self):
        pass

    def plan_phrases(self, text: str) -> List[SpeechPhrase]:
        """Splits full segment text into natural spoken Vietnamese phrases."""
        if not text or not text.strip():
            return []

        # Split on sentence boundaries and major punctuation
        raw_parts = re.split(r'([,\.\?!;\:])', text)
        
        phrases: List[SpeechPhrase] = []
        curr_text = ""
        
        for i in range(0, len(raw_parts), 2):
            part = raw_parts[i].strip()
            punct = raw_parts[i+1].strip() if i+1 < len(raw_parts) else ""
            
            if not part:
                continue
                
            curr_text = part
            words = curr_text.split()
            
            # If phrase is over 15 words without commas, split at conjunctions (và, hoặc, nhưng, để, vì)
            if len(words) > 15:
                sub_parts = re.split(r'\b(và|hoặc|nhưng|để|vì|mà)\b', curr_text)
                sub_curr = ""
                for j in range(len(sub_parts)):
                    token = sub_parts[j].strip()
                    if token in ["và", "hoặc", "nhưng", "để", "vì", "mà"]:
                        if sub_curr:
                            phrases.append(SpeechPhrase(
                                text=sub_curr,
                                phrase_index=len(phrases),
                                boundary_after=",",
                                word_count=len(sub_curr.split())
                            ))
                        sub_curr = token + " "
                    else:
                        sub_curr += token + " "
                if sub_curr.strip():
                    phrases.append(SpeechPhrase(
                        text=sub_curr.strip(),
                        phrase_index=len(phrases),
                        boundary_after=punct if punct else ",",
                        word_count=len(sub_curr.strip().split()),
                        is_question="?" in punct,
                        is_exclamation="!" in punct
                    ))
            else:
                phrases.append(SpeechPhrase(
                    text=curr_text,
                    phrase_index=len(phrases),
                    boundary_after=punct,
                    word_count=len(words),
                    is_question="?" in punct,
                    is_exclamation="!" in punct
                ))

        return phrases
