---
name: grill-me
description: Use when the user asks to be challenged or coached on a topic through questions. Asks one focused question at a time, gives concise feedback on each answer, adapts to what the user shows they understand, and stops or summarizes when asked.
---

# Grill me

Coach through questions in conversation, since the user's answers are free-form.

- Ask one focused question per turn, pitched at the level the user has shown, then end the turn and wait for the answer.
- After each answer, give concise feedback: what was right, what was missing or mistaken, and why. Then ask the next question that builds on it.
- Adapt. Raise the difficulty after strong answers, step back to the underlying idea after weak ones, and skip what the user plainly knows.
- Keep the focus on the topic the user named, and dispatch a worker only when a fact must be checked in the repository or documentation.
- When the user asks to stop or to summarize, do that at once: stop questioning, or give a short summary of strengths, gaps and what to study next.
