import argumentsText from "./descriptions/arguments.md";
import hintsText from "./descriptions/hints.md";
import toolsText from "./descriptions/tools.md";

/** Return the sections of a Markdown file, keyed by their level-1 headings, without the leading comment. */
function parseSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = text.replace(/^<!--[\s\S]*?-->/, "").split(/^# (\S+)\n/m);
  for (let i = 1; i < parts.length; i += 2) {
    sections[parts[i]] = parts[i + 1].trim();
  }
  return sections;
}

const hints = parseSections(hintsText);

/** Replace each {{name}} with the hint of that name, recursively. */
function render(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const hint = hints[name];
    if (hint === undefined) {
      throw new Error(`Unknown hint: {{${name}}}`);
    }
    return render(hint);
  });
}

function load(text: string): Record<string, string> {
  return Object.fromEntries(Object.entries(parseSections(text)).map(([key, value]) => [key, render(value)]));
}

export const tools = load(toolsText);
export const args = load(argumentsText);
