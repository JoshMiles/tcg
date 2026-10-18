import type { Config } from 'tailwindcss';
import base from '../tailwind.config';

// The app's Tailwind theme plus a safelist of the common utility families, so designs built in
// Claude Design can use classes the app itself happens not to use yet (the app build purges them).
const n = '(0|0\\.5|1|1\\.5|2|2\\.5|3|4|5|6|8|10|12|16)';
const shades = '(50|100|200|300|400|500|600|700|800|900|950)';

const config: Config = {
  ...base,
  safelist: [
    { pattern: /^(grid-cols|col-span)-(1|2|3|4|5|6|12)$/ },
    { pattern: new RegExp(`^(gap|gap-x|gap-y|space-x|space-y)-${n}$`) },
    { pattern: new RegExp(`^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-${n}$`) },
    { pattern: /^(w|h|size)-(1|2|3|4|5|6|8|10|12|14|16|20|24|32|40|48|56|64|72|80|96|full|auto)$/ },
    { pattern: /^max-w-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|full|prose)$/ },
    { pattern: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)$/ },
    { pattern: /^font-(normal|medium|semibold|bold|extrabold|black|display|sans)$/ },
    { pattern: /^rounded(-(sm|md|lg|xl|2xl|3xl|full|none))?$/ },
    { pattern: /^(flex|grid|inline-flex|block|inline-block|hidden|flex-col|flex-row|flex-wrap|flex-1|shrink-0|grow)$/ },
    { pattern: /^(items|justify)-(start|center|end|between|stretch|baseline)$/ },
    { pattern: new RegExp(`^(bg|text|border)-(gray|yellow)-${shades}$`), variants: ['hover'] },
    { pattern: /^(bg|text|border)-(red|green|amber|purple|sky)-(200|300|400|500)$/ },
    { pattern: /^(bg|text|border)-poke-(blue|blue-light|red)$/ },
    { pattern: /^bg-(gray|yellow|red|green|amber|purple)-(500|800|900|950)\/(10|20|40|60|70|80)$/ },
    { pattern: /^border-(gray|yellow|red|green|amber|purple)-(400|500|700|800)\/(30|40|60)$/ },
    { pattern: /^shadow-(card|glow|sm|md|lg|xl|2xl)$/ },
  ],
};

export default config;
