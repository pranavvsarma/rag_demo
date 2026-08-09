# app/components

Chat UI components.

- `TopNav.tsx` — nav bar linking Chat ↔ Data Explorer.
- `ChatWindow.tsx` — wires `useChat` to the UI; consumes `?dataset=`/`?report=` deep links.
- `MessageList.tsx` — message stream, auto-scroll, empty state.
- `MessageBubble.tsx` — user/assistant message bubbles, streaming cursor.
- `ChartMessage.tsx` — Chart.js chart rendered inside a chat message.
- `ChatInput.tsx` — auto-growing textarea, CSV attach, Enter-to-send.
- `Sources.tsx` — collapsible citations for retrieved RAG chunks.
