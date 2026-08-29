/** Block-screen quotes. Kept in core so mobile shows the same ones. */
export const QUOTES = [
  { text: 'You are what you do, not what you say you will do.', by: 'Carl Jung' },
  { text: 'The best way to predict the future is to invent it.', by: 'Alan Kay' },
  { text: 'Amateurs sit and wait for inspiration. The rest of us just get up and go to work.', by: 'Stephen King' },
  { text: 'A person who never made a mistake never tried anything new.', by: 'Albert Einstein' },
  { text: 'Attention is the rarest and purest form of generosity.', by: 'Simone Weil' },
  { text: 'We are drowning in information but starved for knowledge.', by: 'John Naisbitt' },
  { text: 'The scarce resource is no longer information. It is attention.', by: 'Herbert Simon' },
  { text: 'Do the work. Then let it go.', by: 'Anonymous' },
  { text: 'Creating is the opposite of consuming. Only one of them changes you.', by: 'Anonymous' },
  { text: 'You cannot think your way into writing. You write your way into thinking.', by: 'Anonymous' },
];

export function pickQuote(seed = Date.now()) {
  return QUOTES[Math.abs(Math.floor(seed / 60_000)) % QUOTES.length];
}
