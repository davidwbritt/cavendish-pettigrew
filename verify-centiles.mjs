import { ordinal } from './src/report.js';

console.log('Verifying ordinal formatting for centile range 75-85:');
console.log('');

for (let i = 75; i <= 85; i++) {
  const formatted = ordinal(i);
  console.log(`${i} → ${formatted}`);
}

// Also verify the headline centile function produces correct values
import { headlineCentile } from './src/scoring.js';
import { mulberry32 } from './src/rng.js';

console.log('');
console.log('Sampling headline centiles across 300 seeds:');
const centiles = new Set();
for (let s = 0; s < 300; s++) {
  const c = headlineCentile(mulberry32(s));
  centiles.add(c);
  if (c < 75 || c > 85) {
    console.error(`ERROR: centile ${c} is outside 75-85 range at seed ${s}`);
    process.exit(1);
  }
}

console.log(`Range: ${Math.min(...centiles)} - ${Math.max(...centiles)}`);
console.log(`Unique values: ${centiles.size}`);
console.log('All centiles: ' + Array.from(centiles).sort((a, b) => a - b).join(', '));
