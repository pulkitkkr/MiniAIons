import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

/**
 * Rich markdown-to-HTML renderer.
 * Uses marked's default rendering for most elements, then applies
 * Tailwind classes via post-processing. Only overrides code blocks
 * (which need a header + copy button) and codespan.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return hljs.highlightAuto(code).value;
    },
  })
);

// Only override renderers that receive pre-rendered text (not tokens)
marked.use({
  renderer: {
    // Code blocks: header bar + syntax highlight + copy button
    code({ text, lang }: any) {
      const rawText = typeof text === 'string' ? text : String(text);
      const langStr = typeof lang === 'string' ? lang : '';
      const highlighted = langStr && hljs.getLanguage(langStr)
        ? hljs.highlight(rawText, { language: langStr }).value
        : hljs.highlightAuto(rawText).value;
      const label = escapeHtml(langStr || 'code');

      return `<div class="codeblock my-3 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
<div class="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 px-4 py-1.5">
<span class="text-[10px] font-mono font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">${label}</span>
<button onclick="(function(b){navigator.clipboard.writeText(b.closest('.codeblock').querySelector('code').textContent);b.textContent='Copied!';setTimeout(function(){b.textContent='Copy'},1500)})(this)" class="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer">Copy</button>
</div>
<pre class="overflow-x-auto p-4 text-[13px] leading-relaxed bg-zinc-50 dark:bg-zinc-900 m-0"><code class="hljs language-${label}">${highlighted}</code></pre>
</div>`;
    },

    // Inline code
    codespan({ text }: any) {
      const raw = typeof text === 'string' ? text : String(text);
      return `<code class="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[12px] font-mono text-pink-600 dark:text-pink-400 border border-zinc-200 dark:border-zinc-700">${raw}</code>`;
    },
  },
});

/**
 * Post-process HTML to add Tailwind classes to standard elements.
 * This avoids the token-object bug in marked v15 custom renderers.
 */
function addTailwindClasses(html: string): string {
  return html
    // Headings
    .replace(/<h1>/g, '<h1 class="text-xl font-bold mt-6 mb-3 text-zinc-900 dark:text-zinc-100">')
    .replace(/<h2>/g, '<h2 class="text-lg font-bold mt-5 mb-2.5 text-zinc-900 dark:text-zinc-100">')
    .replace(/<h3>/g, '<h3 class="text-base font-semibold mt-4 mb-2 text-zinc-900 dark:text-zinc-100">')
    .replace(/<h4>/g, '<h4 class="text-sm font-semibold mt-3 mb-1.5 text-zinc-800 dark:text-zinc-200">')
    .replace(/<h5>/g, '<h5 class="text-sm font-medium mt-2 mb-1 text-zinc-700 dark:text-zinc-300">')
    .replace(/<h6>/g, '<h6 class="text-xs font-medium mt-2 mb-1 text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">')
    // Paragraphs
    .replace(/<p>/g, '<p class="mb-3 text-[14px] text-zinc-800 dark:text-zinc-200 leading-[1.8]">')
    // Lists
    .replace(/<ul>/g, '<ul class="list-disc pl-5 my-2.5 space-y-1 text-[14px] text-zinc-800 dark:text-zinc-200 leading-relaxed marker:text-zinc-400">')
    .replace(/<ol>/g, '<ol class="list-decimal pl-5 my-2.5 space-y-1 text-[14px] text-zinc-800 dark:text-zinc-200 leading-relaxed marker:text-zinc-400">')
    .replace(/<li>/g, '<li class="[&_p]:mb-0">')
    // Blockquotes
    .replace(/<blockquote>/g, '<blockquote class="my-3 pl-4 border-l-[3px] border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 italic [&_p]:mb-1">')
    // Tables
    .replace(/<table>/g, '<div class="my-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700"><table class="w-full text-[13px]">')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<thead>/g, '<thead class="bg-zinc-50 dark:bg-zinc-800/50">')
    .replace(/<th>/g, '<th class="px-4 py-2.5 text-left text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">')
    .replace(/<th align="(.*?)">/g, '<th class="px-4 py-2.5 text-$1 text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">')
    .replace(/<td>/g, '<td class="px-4 py-2.5 text-zinc-700 dark:text-zinc-300 border-t border-zinc-100 dark:border-zinc-800">')
    .replace(/<td align="(.*?)">/g, '<td class="px-4 py-2.5 text-$1 text-zinc-700 dark:text-zinc-300 border-t border-zinc-100 dark:border-zinc-800">')
    .replace(/<tr>/g, '<tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">')
    // Links
    .replace(/<a href="/g, '<a target="_blank" rel="noopener" class="text-blue-600 dark:text-blue-400 underline decoration-blue-300 dark:decoration-blue-700 underline-offset-2 hover:decoration-blue-500 transition-colors" href="')
    // Strong and em
    .replace(/<strong>/g, '<strong class="font-semibold text-zinc-900 dark:text-zinc-100">')
    .replace(/<em>/g, '<em class="italic">')
    .replace(/<del>/g, '<del class="line-through text-zinc-400 dark:text-zinc-500">')
    // HR
    .replace(/<hr>/g, '<hr class="my-6 border-t border-zinc-200 dark:border-zinc-700">')
    .replace(/<hr\/>/g, '<hr class="my-6 border-t border-zinc-200 dark:border-zinc-700" />')
    // Images
    .replace(/<img /g, '<img class="rounded-xl border border-zinc-200 dark:border-zinc-700 max-w-full my-3" loading="lazy" ')
    // Task list checkboxes
    .replace(/<input checked="" disabled="" type="checkbox">/g, '<span class="inline-flex items-center justify-center w-4 h-4 mr-1.5 rounded border border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 text-[10px] align-text-bottom">✓</span>')
    .replace(/<input disabled="" type="checkbox">/g, '<span class="inline-flex items-center justify-center w-4 h-4 mr-1.5 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 align-text-bottom"></span>');
}

export function renderMarkdown(text: string): string {
  const raw = marked.parse(text) as string;
  return addTailwindClasses(raw);
}
